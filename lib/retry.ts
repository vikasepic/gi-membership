import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { tagContact } from "@/lib/activecampaign";
import { notifyAppEntitlement } from "@/lib/apps";
import { sendCrmEvent, type CrmEvent } from "@/lib/crm";
import { messageOf, nextAttemptAt, MAX_ATTEMPTS, type JobKind } from "@/lib/errors";

// Replaying failed side effects.
//
// A typed job kind plus a JSON payload, rather than a general-purpose queue: the
// set of things worth retrying here is small and known, and a dispatcher that
// only understands three shapes cannot be handed a payload it will misread.
//
// Every job must be safe to run twice. Tagging a contact that is already tagged
// is a no-op in ActiveCampaign, entitlement pushes are declarative state rather
// than increments, and CRM events carry their own ids — so a job that actually
// succeeded but failed to record that is harmless when it runs again.

type Runner = (payload: Record<string, unknown>) => Promise<void>;

const RUNNERS: Record<JobKind, Runner> = {
  ac_tag: async (p) => {
    const { ok } = await tagContact({
      email: String(p.email),
      fullName: (p.fullName as string) ?? null,
      tagIds: (p.tagIds as string[]) ?? [],
      removeTagIds: (p.removeTagIds as string[]) ?? [],
    });
    // tagContact reports failure by return value rather than by throwing — it
    // is built never to throw, because it runs after a card is charged. Without
    // this the sweep would mark a still-broken job resolved and the retry queue
    // would quietly empty itself of work it never did.
    if (!ok) throw new Error("ActiveCampaign still failing");
  },
  app_entitlement: async (p) => {
    const res = await notifyAppEntitlement({
      appId: String(p.appId),
      email: String(p.email),
      entitlementKey: (p.entitlementKey as string) ?? null,
      // Replayed from the payload the failed attempt was queued with, so a
      // retry grants exactly what the original push was going to — not what
      // the offer happens to say by the time the app comes back up.
      channels: Array.isArray(p.channels) ? (p.channels as string[]) : null,
      status: p.status as "active" | "trialing" | "canceled" | "past_due",
      stripeCustomerId: (p.stripeCustomerId as string) ?? null,
      stripeSubscriptionId: (p.stripeSubscriptionId as string) ?? null,
      fullName: (p.fullName as string) ?? null,
    },
    // This IS the retry. Queueing from here would add a job per sweep.
    { queueOnFailure: false });
    // notifyAppEntitlement reports failure by return value rather than by
    // throwing, so without this the sweep would mark a still-broken push done.
    if (!res.ok) throw new Error(res.error ?? `app returned ${res.status}`);
  },
  crm_event: async (p) => {
    await sendCrmEvent(p as unknown as CrmEvent);
  },
};

export type SweepResult = { attempted: number; succeeded: number; failed: number; exhausted: number };

/**
 * Run every job that is due. Called by the cron route.
 *
 * Claims each row before running it, so two overlapping sweeps cannot both
 * perform the same job — the cron firing while a slow sweep is still going is
 * a matter of when, not if.
 */
export async function runDueJobs(limit = 50): Promise<SweepResult> {
  const db = createServiceClient();
  const result: SweepResult = { attempted: 0, succeeded: 0, failed: 0, exhausted: 0 };

  const { data: due } = await db
    .from("error_events")
    .select("id, job_kind, job_payload, attempts")
    .is("resolved_at", null)
    .not("job_kind", "is", null)
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  for (const row of due ?? []) {
    const attempts = (row.attempts as number) ?? 0;
    // Claim: push next_attempt_at out before running, and only if it is still
    // where we found it. A concurrent sweep that already claimed this row
    // updates zero rows here and skips it.
    const { data: claimed } = await db
      .from("error_events")
      .update({ attempts: attempts + 1, next_attempt_at: nextAttemptAt(attempts + 1) })
      .eq("id", row.id)
      .eq("attempts", attempts)
      .select("id");
    if (!claimed || claimed.length === 0) continue;

    result.attempted++;
    const runner = RUNNERS[row.job_kind as JobKind];
    if (!runner) {
      // An unknown kind is a bug, not a transient failure — retrying it forever
      // would bury the queue under something that can never succeed.
      await db
        .from("error_events")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", row.id);
      result.exhausted++;
      continue;
    }

    try {
      await runner((row.job_payload as Record<string, unknown>) ?? {});
      await db
        .from("error_events")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", row.id);
      result.succeeded++;
    } catch (e) {
      const spent = attempts + 1 >= MAX_ATTEMPTS;
      await db
        .from("error_events")
        .update({
          message: messageOf(e).slice(0, 2000),
          // Out of attempts: stop retrying but leave it UNRESOLVED, so it stays
          // in the admin list as something a human still has to deal with.
          next_attempt_at: spent ? null : nextAttemptAt(attempts + 1),
        })
        .eq("id", row.id);
      if (spent) result.exhausted++;
      else result.failed++;
    }
  }

  return result;
}

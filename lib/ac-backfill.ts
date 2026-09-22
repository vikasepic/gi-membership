import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { activeCampaignEnabled } from "@/lib/activecampaign";
import { tagLifecycle } from "@/lib/ac-tags";
import type { OwnershipStatus } from "@/lib/subscription-sync";

/**
 * Give everyone the lifecycle tag their current state already earned.
 *
 * Tagging used to happen only in `finalizeOrder`, so an offer bought on its
 * own page granted access without ever reaching the CRM. Found 22 Sep 2026:
 * 57 Content Engine trialists with no trial tag, which meant no trial nurture
 * sequence had ever started for any of them.
 *
 * It applies the tag for the status each person holds RIGHT NOW, not the one
 * they would have been given at purchase. Someone who started a trial and has
 * since cancelled gets the cancelled tag, not a trial tag that would drop
 * them into a sequence for a trial they are no longer in.
 *
 * Idempotent: applying a tag someone already carries is a no-op at
 * ActiveCampaign's end, so a second run costs API calls and changes nothing.
 */

export type BackfillResult = {
  ok: boolean;
  people: number;
  tagged: number;
  skipped: Record<string, number>;
};

/** ActiveCampaign allows a handful of requests a second and one tag costs several. */
const PACE_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = { userId: string; offerId: string; status: OwnershipStatus };

export async function backfillLifecycleTags(opts?: { dryRun?: boolean }): Promise<BackfillResult> {
  const skipped: Record<string, number> = {};
  const note = (why: string) => {
    skipped[why] = (skipped[why] ?? 0) + 1;
  };
  if (!activeCampaignEnabled()) return { ok: false, people: 0, tagged: 0, skipped: { "activecampaign not configured": 1 } };

  const db = createServiceClient();

  // Only offers that actually carry a lifecycle tag. An offer with none
  // configured has nothing to backfill and would cost a pointless round trip.
  const { data: offers, error: offerErr } = await db
    .from("offers")
    .select("id, activecampaign_tag_id, activecampaign_trial_tag_id, activecampaign_cancelled_tag_id");
  if (offerErr) throw new Error(`backfillLifecycleTags offers: ${offerErr.message}`);
  const tagged = new Set(
    (offers ?? [])
      .filter((o) => o.activecampaign_tag_id || o.activecampaign_trial_tag_id || o.activecampaign_cancelled_tag_id)
      .map((o) => o.id as string),
  );
  if (tagged.size === 0) return { ok: true, people: 0, tagged: 0, skipped: { "no offer carries a tag": 1 } };

  const { data: rows, error } = await db
    .from("ownership")
    .select("user_id, offer_id, status")
    .not("offer_id", "is", null)
    .not("user_id", "is", null);
  if (error) throw new Error(`backfillLifecycleTags ownership: ${error.message}`);

  const wanted: Row[] = (rows ?? [])
    .filter((r) => tagged.has(r.offer_id as string))
    .map((r) => ({ userId: r.user_id as string, offerId: r.offer_id as string, status: r.status as OwnershipStatus }));

  // Grouped so one person with three Content Engine channels is one call, not
  // three. The key is person plus status: the tag to apply depends on both.
  const groups = new Map<string, { userId: string; status: OwnershipStatus; offerIds: string[] }>();
  for (const r of wanted) {
    if (r.status === "past_due") {
      // Nothing about their standing has changed while Stripe retries, so
      // there is no tag that would be true.
      note("past_due, nothing to say yet");
      continue;
    }
    const key = `${r.userId}:${r.status}`;
    const g = groups.get(key) ?? { userId: r.userId, status: r.status, offerIds: [] };
    g.offerIds.push(r.offerId);
    groups.set(key, g);
  }

  let done = 0;
  for (const g of groups.values()) {
    if (opts?.dryRun) {
      done += 1;
      continue;
    }
    try {
      await tagLifecycle({ userId: g.userId, offerIds: g.offerIds, status: g.status });
      done += 1;
    } catch (e) {
      // One unreachable contact must not end the sweep; the rest are still
      // people sitting outside every sequence that was built for them.
      note(`error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 120));
    }
    await sleep(PACE_MS);
  }

  return { ok: true, people: new Set(wanted.map((r) => r.userId)).size, tagged: done, skipped };
}

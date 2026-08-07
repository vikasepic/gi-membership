import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { pushOwnershipStateToApps } from "@/lib/app-sync";

/**
 * Re-send everyone the store has already told an app about, with their name.
 *
 * The name only started riding along on the provision call recently, so every
 * account provisioned before that arrived at the app as an email address and
 * nothing else. This walks the entitlements the store already holds and sends
 * their CURRENT state again.
 *
 * It grants nothing. `pushOwnershipStateToApps` reads `ownership.status` and
 * sends exactly that, so a cancelled row re-sends as cancelled and an app that
 * honours the contract treats the whole pass as a no-op apart from the name.
 * That is the only reason this is safe to run against a live app: it cannot
 * invent access for someone who never bought, because it never sends a status
 * that is not already recorded here.
 */

export type BackfillPlan = {
  appId: string;
  /** Entitlements the store holds for this app. */
  total: number;
  /** How many of those we can actually name — the point of the exercise. */
  named: number;
  /** Rows whose member has no name stored; sending them changes nothing. */
  unnamed: number;
  ownershipIds: string[];
};

/**
 * What a run would do, without doing it.
 *
 * Separate from the send because this reaches a third party over the network:
 * seeing "12 entitlements, 9 with names" before anything leaves is the
 * difference between a decision and a surprise.
 */
export async function planNameBackfill(appId: string): Promise<BackfillPlan> {
  const db = createServiceClient();

  const { data: rows } = await db
    .from("ownership")
    .select("id, user_id")
    .eq("app_id", appId);

  const ids = (rows ?? []).map((r) => r.id as string);
  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))];

  let named = 0;
  if (userIds.length > 0) {
    const { data: users } = await db
      .from("users")
      .select("id, username")
      .in("id", userIds);
    const withName = new Set(
      (users ?? [])
        .filter((u) => ((u.username as string | null) ?? "").trim().length > 0)
        .map((u) => u.id as string),
    );
    named = (rows ?? []).filter((r) => withName.has(r.user_id as string)).length;
  }

  return {
    appId,
    total: ids.length,
    named,
    unnamed: ids.length - named,
    ownershipIds: ids,
  };
}

/**
 * Send it.
 *
 * Only the rows we can name are sent. Re-sending a nameless entitlement is a
 * network call that changes nothing at the far end, and every one of them is a
 * chance for a flaky endpoint to queue a retry for no reason.
 */
export async function runNameBackfill(appId: string): Promise<{ sent: number; skipped: number }> {
  const db = createServiceClient();
  const plan = await planNameBackfill(appId);
  if (plan.ownershipIds.length === 0) return { sent: 0, skipped: 0 };

  const { data: rows } = await db
    .from("ownership")
    .select("id, user_id")
    .in("id", plan.ownershipIds);

  const { data: users } = await db
    .from("users")
    .select("id, username")
    .in("id", [...new Set((rows ?? []).map((r) => r.user_id as string))]);
  const withName = new Set(
    (users ?? [])
      .filter((u) => ((u.username as string | null) ?? "").trim().length > 0)
      .map((u) => u.id as string),
  );

  const toSend = (rows ?? [])
    .filter((r) => withName.has(r.user_id as string))
    .map((r) => r.id as string);

  await pushOwnershipStateToApps(toSend);
  return { sent: toSend.length, skipped: plan.ownershipIds.length - toSend.length };
}

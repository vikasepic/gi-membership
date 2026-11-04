import "server-only";
import { unionEntitlement } from "@/lib/app-sync";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import type { AppRow } from "@/lib/apps";
import { hasAccess, type OwnershipStatus } from "@/lib/subscription-sync";

/**
 * The store's answer to "does this email still have access to your app?"
 *
 * The pull side of the entitlement contract. The push already tells an app
 * what changed; this answers the same question on demand, which an app needs
 * when it has lost its own copy — Content Engine's workspace delete destroyed
 * the local grant, and nothing in its own database could say what had been
 * bought.
 *
 * Deliberately built on `unionEntitlement` and `hasAccess`, the same two
 * functions the push uses, so the two directions cannot disagree. A customer's
 * access must not depend on which way the question travelled.
 *
 * `channels` is OMITTED, never `[]`, when there is no list to send. The
 * contract gives that a specific meaning the asking app relies on: access is
 * real but no channel list is attributable, so leave what you have alone —
 * never a grant, never a revoke. Sending `[]` instead would read as "revoke
 * everything" to an app obeying replace-don't-merge.
 */
export type LookupReply = { hasAccess: boolean; channels?: string[] };

export function lookupAnswer(input: {
  rows: { channels: string[]; status: OwnershipStatus }[];
  /**
   * An app-reported entitlement parked by email because no store account
   * exists yet. `pending_app_entitlements` has no channels column, so this can
   * carry access but never a channel list.
   */
  pending: { status: OwnershipStatus } | null;
}): LookupReply {
  if (input.rows.length > 0) {
    const { channels, status } = unionEntitlement(input.rows);
    const reply: LookupReply = { hasAccess: hasAccess(status) };
    if (channels.length > 0) reply.channels = channels;
    return reply;
  }

  if (input.pending) return { hasAccess: hasAccess(input.pending.status) };

  // No ownership and nothing parked: the store has no record of this email for
  // this app. That is a definitive no, not a shrug — the asking app should act
  // on it rather than keep retrying a question that will not change.
  return { hasAccess: false };
}

/**
 * Everything one email is entitled to in one app, read fresh.
 *
 * Scoped to the app that asked, which is established by its shared secret and
 * never by anything in the request — otherwise one connected app could ask the
 * store about another app's customers.
 *
 * Reads the same rows `pushAppEntitlement` reads (ownership for this user and
 * app, channels off each row's granting offer) so the two directions give the
 * same answer. Falls back to a parked app-reported entitlement when there is
 * no ownership, which is the app-first subscriber who has no store account
 * yet.
 */
export async function entitlementForEmail(app: AppRow, rawEmail: string): Promise<LookupReply> {
  const db = createServiceClient();
  const storeId = await getStoreId();
  const email = rawEmail.trim().toLowerCase();

  const { data: user } = await db
    .from("users")
    .select("id")
    .eq("store_id", storeId)
    .eq("email", email)
    .maybeSingle();

  let rows: { channels: string[]; status: OwnershipStatus }[] = [];
  if (user?.id) {
    const { data: owned } = await db
      .from("ownership")
      .select("offer_id, status")
      .eq("store_id", storeId)
      .eq("user_id", user.id)
      .eq("app_id", app.id);

    const offerIds = [...new Set((owned ?? []).map((r) => r.offer_id).filter(Boolean) as string[])];
    const { data: offers } = offerIds.length
      ? await db.from("offers").select("id, grant_channels").in("id", offerIds)
      : { data: [] as { id: string; grant_channels: string[] | null }[] };
    const byOffer = new Map((offers ?? []).map((o) => [o.id as string, o]));

    rows = (owned ?? []).map((r) => ({
      channels: (byOffer.get(r.offer_id as string)?.grant_channels as string[] | null) ?? [],
      status: r.status as OwnershipStatus,
    }));
  }

  if (rows.length > 0) return lookupAnswer({ rows, pending: null });

  // Checked whenever there is no ownership, not only when the account is
  // missing: a parked row also survives a drain that failed, and answering
  // "no access" to someone the store knows about is the expensive mistake.
  const { data: pending } = await db
    .from("pending_app_entitlements")
    .select("status")
    .eq("store_id", storeId)
    .eq("app_id", app.id)
    .eq("email", email)
    .maybeSingle();

  return lookupAnswer({
    rows: [],
    pending: pending ? { status: pending.status as OwnershipStatus } : null,
  });
}

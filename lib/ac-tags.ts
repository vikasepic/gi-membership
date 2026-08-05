import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { tagContact, activeCampaignEnabled } from "@/lib/activecampaign";
import { recordError, messageOf } from "@/lib/errors";

/**
 * Every tag change goes through here so a failure is queued rather than lost.
 * The payload is exactly the argument object, which is what makes the retry a
 * literal replay rather than a reconstruction that can drift from the original.
 */
async function tagOrQueue(args: {
  email: string;
  fullName?: string | null;
  tagIds?: string[];
  removeTagIds?: string[];
}): Promise<void> {
  try {
    const { ok } = await tagContact(args);
    if (!ok) {
      await recordError({
        source: "activecampaign",
        message: "ActiveCampaign rejected or could not be reached",
        context: { email: args.email, tagIds: args.tagIds, removeTagIds: args.removeTagIds },
        jobKind: "ac_tag",
        jobPayload: args as unknown as Record<string, unknown>,
      });
    }
  } catch (e) {
    await recordError({
      source: "activecampaign",
      message: messageOf(e),
      context: { email: args.email },
      jobKind: "ac_tag",
      jobPayload: args as unknown as Record<string, unknown>,
    });
  }
}

// Which ActiveCampaign tags a given event implies, and who to apply them to.
//
// Separated from lib/activecampaign.ts (which only knows how to talk to the
// API) and from the money path (which should not be full of tag lookups). Every
// function here is safe to call when ActiveCampaign is not configured.

/** The abandoned-cart tags for these products, if they have any. */
export async function abandonedTagIds(productIds: string[]): Promise<string[]> {
  if (productIds.length === 0) return [];
  const db = createServiceClient();
  const { data } = await db
    .from("products")
    .select("activecampaign_abandoned_tag_id")
    .in("id", productIds)
    .not("activecampaign_abandoned_tag_id", "is", null);
  return (data ?? []).map((p) => p.activecampaign_abandoned_tag_id as string);
}

export async function productTagIds(productIds: string[]): Promise<string[]> {
  if (productIds.length === 0) return [];
  const db = createServiceClient();
  const { data } = await db
    .from("products")
    .select("activecampaign_tag_id")
    .in("id", productIds)
    .not("activecampaign_tag_id", "is", null);
  return (data ?? []).map((p) => p.activecampaign_tag_id as string);
}

export async function offerTagIds(offerIds: string[]): Promise<string[]> {
  if (offerIds.length === 0) return [];
  const db = createServiceClient();
  const { data } = await db
    .from("offers")
    .select("activecampaign_tag_id")
    .in("id", offerIds)
    .not("activecampaign_tag_id", "is", null);
  return (data ?? []).map((o) => o.activecampaign_tag_id as string);
}

/** Email plus display name for a user, or null if there's no profile row. */
export async function contactFor(
  userId: string,
): Promise<{ email: string; fullName: string | null } | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("users")
    .select("email, username")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.email) return null;
  return { email: data.email as string, fullName: (data.username as string) ?? null };
}

/**
 * Abandoned-cart tag for someone who has given us an email but has no account
 * and has paid nothing.
 *
 * Called by the lead sweep, not by checkout — addresses are buffered in
 * checkout_leads first and only forwarded here once they have sat unconverted
 * for a while, so a corrected typo never reaches ActiveCampaign and a fast
 * buyer never does either.
 *
 * Takes an email rather than a user id on purpose: creating an account for
 * someone who merely typed an address would let anyone squat on another
 * person's email, and would claim any entitlement parked against it.
 */
export async function tagAbandonedForEmail(args: {
  email: string;
  fullName?: string | null;
  productId: string;
}): Promise<void> {
  if (!activeCampaignEnabled()) return;
  const tagIds = await abandonedTagIds([args.productId]);
  if (tagIds.length === 0) return;
  await tagOrQueue({
    email: args.email.trim().toLowerCase(),
    fullName: args.fullName ?? null,
    tagIds,
  });
}

/**
 * Paid. Apply what they bought, and drop the abandoned-cart tag in the same
 * pass — one contact sync instead of two, and no window in which they are both
 * a customer and an abandoner.
 */
export async function tagPurchase(args: {
  userId: string;
  productIds: string[];
  offerIds: string[];
}): Promise<void> {
  if (!activeCampaignEnabled()) return;
  const contact = await contactFor(args.userId);
  if (!contact) return;
  // The abandoned tags removed are those of the products actually bought, so a
  // buyer who abandons product A and later buys product B keeps A's abandoned
  // tag — and A's sequence still reaches them, which is the point of tagging
  // per product rather than per store.
  // Products only. An offer's tag now depends on whether money was actually
  // taken, which this function has no way of knowing — tagLifecycle owns it.
  const [products, abandoned] = await Promise.all([
    productTagIds(args.productIds),
    abandonedTagIds(args.productIds),
  ]);
  await tagOrQueue({ ...contact, tagIds: products, removeTagIds: abandoned });
}

/**
 * Refunded, or a subscription ended. Takes back exactly what the purchase
 * applied — someone who refunded on day one should stop receiving the
 * onboarding for a thing they no longer own.
 */
export async function untagRevoked(args: {
  userId: string;
  productIds?: string[];
  offerIds?: string[];
}): Promise<void> {
  if (!activeCampaignEnabled()) return;
  const contact = await contactFor(args.userId);
  if (!contact) return;
  const removeTagIds = await productTagIds(args.productIds ?? []);
  if (removeTagIds.length === 0) return;
  await tagOrQueue({ ...contact, removeTagIds });
}

// ---------------------------------------------------------------------------
// The trial / buyer / cancelled lifecycle
// ---------------------------------------------------------------------------

export type OwnershipStatus = "trialing" | "active" | "past_due" | "canceled";

/** The three tags an offer can carry. Any of them may be unset. */
export type LifecycleTags = {
  /** In a trial and has not paid. Kept if they cancel before paying. */
  trial: string | null;
  /** Paying right now. This is the offer's own activecampaign_tag_id. */
  buyer: string | null;
  /** Access has ended at least once. Never taken back. */
  cancelled: string | null;
};

/**
 * Which tags a status implies.
 *
 * A map from status to operations, NOT from transition to operations. That is
 * deliberate: Stripe sends customer.subscription.updated for a card change, a
 * metadata edit and a renewal as well as a real status change, so anything
 * keyed on "went active" would fire every month for the life of the
 * subscription. Applying the same set again is a no-op at ActiveCampaign.
 *
 * The rules, in one place because they are the whole feature:
 *
 *   trialing   +access +trial
 *   active     +access +buyer  −trial      the trial is over; they paid
 *   past_due   nothing                     Stripe is still retrying the card
 *   canceled   +cancelled −access −buyer   the trial tag is deliberately kept
 *
 * Keeping the trial tag through a cancellation is the point of the whole
 * thing, and it is what makes the two segments a single condition each:
 *
 *   cancelled AND trial       tried it, never paid
 *   cancelled AND NOT trial   paid, then left
 *   buyer                     paying right now
 *
 * The buyer tag comes off at cancellation for the same reason: with it gone,
 * a cancelled contact carrying no trial tag can only be someone who paid, and
 * the tag itself means "paying now" rather than "paid once".
 *
 * The cost of that, stated so nobody rediscovers it: a former buyer who
 * cancels and later starts a SECOND trial gets the trial tag back with no
 * buyer tag left to contradict it, so they read as never having paid. Trials
 * are seven days and this needs someone to leave and return, so it is rare —
 * but it is the one case these four tags cannot describe.
 */
export function lifecycleTagOps(
  tags: LifecycleTags,
  status: OwnershipStatus,
): { add: string[]; remove: string[] } {
  const some = (...ids: (string | null)[]) => ids.filter((x): x is string => !!x);
  switch (status) {
    case "trialing":
      return { add: some(tags.trial), remove: [] };
    case "active":
      return { add: some(tags.buyer), remove: some(tags.trial) };
    case "past_due":
      // Access is not withdrawn while Stripe retries, so nothing about their
      // standing has changed yet either.
      return { add: [], remove: [] };
    case "canceled":
      return { add: some(tags.cancelled), remove: some(tags.buyer) };
  }
}

/** The lifecycle tags configured on these offers. */
export async function lifecycleTagsFor(offerIds: string[]): Promise<Map<string, LifecycleTags>> {
  const out = new Map<string, LifecycleTags>();
  if (offerIds.length === 0) return out;
  const db = createServiceClient();
  const { data } = await db
    .from("offers")
    .select("id, activecampaign_tag_id, activecampaign_trial_tag_id, activecampaign_cancelled_tag_id")
    .in("id", offerIds);
  for (const row of data ?? []) {
    out.set(row.id as string, {
      trial: (row.activecampaign_trial_tag_id as string | null) ?? null,
      // The offer's own tag. It was called "access" for one afternoon; the two
      // only ever differed during a trial, which is exactly what the trial tag
      // is for.
      buyer: (row.activecampaign_tag_id as string | null) ?? null,
      cancelled: (row.activecampaign_cancelled_tag_id as string | null) ?? null,
    });
  }
  return out;
}

/**
 * Move someone's tags to match where their subscription now stands.
 *
 * Called from every path that learns a status — checkout, the Stripe webhook,
 * and an app reporting its own sale — because a tag that only moves on one of
 * them is a tag that is wrong for everyone who arrived another way.
 */
export async function tagLifecycle(args: {
  userId: string;
  offerIds: string[];
  status: OwnershipStatus;
}): Promise<void> {
  if (!activeCampaignEnabled() || args.offerIds.length === 0) return;
  const contact = await contactFor(args.userId);
  if (!contact) return;
  const tags = await lifecycleTagsFor(args.offerIds);

  const add = new Set<string>();
  const remove = new Set<string>();
  for (const id of args.offerIds) {
    const t = tags.get(id);
    if (!t) continue;
    const ops = lifecycleTagOps(t, args.status);
    ops.add.forEach((x) => add.add(x));
    ops.remove.forEach((x) => remove.add(x));
  }
  // Two offers could name the same tag with opposite intent. Adding wins: a
  // subscription someone still holds must not lose its tag because a different
  // one ended.
  remove.forEach((x) => add.has(x) && remove.delete(x));
  if (add.size === 0 && remove.size === 0) return;
  await tagOrQueue({ ...contact, tagIds: [...add], removeTagIds: [...remove] });
}

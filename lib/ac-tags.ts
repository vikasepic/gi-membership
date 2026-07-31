import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
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
 * Someone reached checkout and a PaymentIntent exists, but nothing is paid yet.
 *
 * Tagged immediately rather than by a scheduled job that looks for stale
 * pending orders: the tag IS the timer. The ActiveCampaign automation waits an
 * hour and re-checks, and finalizeOrder removes the tag the moment payment
 * succeeds — so a buyer who completes in two minutes never gets the email, and
 * there is no cron to run, monitor, or notice has stopped.
 */
export async function tagCartStarted(userId: string, productId: string): Promise<void> {
  if (!activeCampaignEnabled()) return;
  const tagIds = await abandonedTagIds([productId]);
  if (tagIds.length === 0) return;
  const contact = await contactFor(userId);
  if (!contact) return;
  await tagOrQueue({ ...contact, tagIds });
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
  const [products, offers, abandoned] = await Promise.all([
    productTagIds(args.productIds),
    offerTagIds(args.offerIds),
    abandonedTagIds(args.productIds),
  ]);
  await tagOrQueue({
    ...contact,
    tagIds: [...products, ...offers],
    removeTagIds: abandoned,
  });
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
  const [products, offers] = await Promise.all([
    productTagIds(args.productIds ?? []),
    offerTagIds(args.offerIds ?? []),
  ]);
  const removeTagIds = [...products, ...offers];
  if (removeTagIds.length === 0) return;
  await tagOrQueue({ ...contact, removeTagIds });
}

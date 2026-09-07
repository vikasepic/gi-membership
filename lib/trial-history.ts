import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import type { Offer } from "@/lib/types";

/**
 * A free trial is a thing you get once.
 *
 * The reason this is one function and not a flag at the Stripe call: a trial is
 * read in six places — the subscription's trial_period_days, what the buyer is
 * told is due today, the "7 days free" badge, whether ownership starts as
 * trialing, whether the trial tag or the buyer tag applies, and the {trial}
 * token on the page. If any one of them disagrees with the others, a page says
 * FREE and a card gets charged. That is worse than the abuse it would be
 * preventing.
 *
 * So the decision is made once, and applied by handing every one of those six
 * the same offer with its trial already removed.
 */

/**
 * What a trial actually gave away, as one key per thing given.
 *
 * Keyed on the GRANT rather than the offer: the monthly and the yearly Content
 * Engine offers both grant the same app, so trialling one has to close the
 * other — an offer-keyed record is a loophole with two doors.
 *
 * And keyed per CHANNEL, because the channels are sold separately. Instagram
 * and LinkedIn can each be trialled once; monthly and yearly of one channel
 * still share a trial because the channel is what splits, not the price; and
 * the bundle is refused a trial once either of its channels has been used.
 *
 * An offer with no channels produces exactly the string this produced before
 * the channels existed. Rows already exist under it, and a changed format
 * would silently hand everybody a second free trial.
 */
export function grantKeysOf(
  offer: Pick<Offer, "grantAppId" | "grantEntitlementKey" | "grantProductId" | "grantChannels">,
): string[] {
  if (offer.grantAppId) {
    const base = `app:${offer.grantAppId}:${offer.grantEntitlementKey ?? ""}`;
    const channels = [...(offer.grantChannels ?? [])].sort();
    // Sorted so one channel set is one identity however the array arrived.
    return channels.length === 0 ? [base] : channels.map((c) => `${base}:ch:${c}`);
  }
  if (offer.grantProductId) return [`product:${offer.grantProductId}`];
  return [];
}

const norm = (email: string) => email.trim().toLowerCase();

/** Whether this address has already had a free trial of this thing. */
export async function hasHadTrial(email: string | null | undefined, offer: Offer): Promise<boolean> {
  if (!email || !offer.trialDays || offer.trialDays <= 0) return false;
  const keys = grantKeysOf(offer);
  if (keys.length === 0) return false;
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("trial_history")
      .select("id")
      .eq("store_id", await getStoreId())
      .eq("email", norm(email))
      .in("grant_key", keys)
      .limit(1);
    // ANY of them: someone who has trialled Instagram has used the bundle's
    // Instagram half, so the bundle's trial is gone too.
    return (data?.length ?? 0) > 0;
  } catch {
    // Unreachable table means we cannot prove they have had one. Giving a trial
    // we should not have costs a few days of one subscription; refusing one
    // someone is entitled to costs the sale and the trust.
    return false;
  }
}

/**
 * The offer as it applies to THIS buyer.
 *
 * Returns the same object untouched for anyone who has not had the trial, so
 * the common path allocates nothing and behaves exactly as before. For a
 * repeat, `trialDays` is null — and because every surface reads the trial off
 * the offer, they all change together: the price card stops saying free, the
 * badge disappears, the charge today becomes the full price, ownership starts
 * active rather than trialing, and the buyer tag applies instead of the trial
 * tag. Nothing has to remember to check a flag.
 */
export function withoutTrial(offer: Offer): Offer {
  return offer.trialDays ? { ...offer, trialDays: null } : offer;
}

export async function offerAsSoldTo(email: string | null | undefined, offer: Offer): Promise<Offer> {
  return (await hasHadTrial(email, offer)) ? withoutTrial(offer) : offer;
}

/**
 * Remember that this address has now had one.
 *
 * Written when a trial actually starts, not when an offer with a trial is
 * bought — a repeat buyer gets no trial and so uses none up.
 */
export async function recordTrialStart(email: string, offer: Offer): Promise<void> {
  if (!offer.trialDays || offer.trialDays <= 0) return;
  const keys = grantKeysOf(offer);
  if (keys.length === 0) return;
  try {
    const db = createServiceClient();
    const storeId = await getStoreId();
    await db.from("trial_history").upsert(
      keys.map((grant_key) => ({ store_id: storeId, email: norm(email), grant_key })),
      { onConflict: "store_id,email,grant_key" },
    );
  } catch (e) {
    // The trial has already been granted by the time this runs. Failing here
    // must not fail the purchase; the cost is one extra free trial one day.
    console.error("[recordTrialStart] could not record:", e);
  }
}

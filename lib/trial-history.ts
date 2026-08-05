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
 * What a trial actually gave away.
 *
 * Keyed on the GRANT, not the offer. The monthly and the yearly Funnel App
 * offers both grant app 8ee0…/funnel, so trialling one has to close the other —
 * an offer-keyed record is a loophole with two doors.
 */
export function grantKeyOf(offer: Pick<Offer, "grantAppId" | "grantEntitlementKey" | "grantProductId">): string | null {
  if (offer.grantAppId) return `app:${offer.grantAppId}:${offer.grantEntitlementKey ?? ""}`;
  if (offer.grantProductId) return `product:${offer.grantProductId}`;
  return null;
}

const norm = (email: string) => email.trim().toLowerCase();

/** Whether this address has already had a free trial of this thing. */
export async function hasHadTrial(email: string | null | undefined, offer: Offer): Promise<boolean> {
  if (!email || !offer.trialDays || offer.trialDays <= 0) return false;
  const key = grantKeyOf(offer);
  if (!key) return false;
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("trial_history")
      .select("id")
      .eq("store_id", await getStoreId())
      .eq("email", norm(email))
      .eq("grant_key", key)
      .maybeSingle();
    return !!data;
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
  const key = grantKeyOf(offer);
  if (!key) return;
  try {
    const db = createServiceClient();
    await db
      .from("trial_history")
      .upsert(
        { store_id: await getStoreId(), email: norm(email), grant_key: key },
        { onConflict: "store_id,email,grant_key" },
      );
  } catch (e) {
    // The trial has already been granted by the time this runs. Failing here
    // must not fail the purchase; the cost is one extra free trial one day.
    console.error("[recordTrialStart] could not record:", e);
  }
}

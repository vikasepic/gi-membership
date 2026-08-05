// Offer eligibility — correctness, not polish (plan): an offer is NEVER shown
// to a buyer who already owns or subscribes to what it grants.

export type Ownership = { productIds: Set<string>; appIds: Set<string> };

type GrantTarget = {
  grantType: "product" | "subscription";
  grantProductId: string | null;
  grantAppId: string | null;
};

export function isOfferEligible(offer: GrantTarget, owned: Ownership): boolean {
  if (offer.grantType === "product") {
    if (!offer.grantProductId) return false; // misconfigured — skip
    return !owned.productIds.has(offer.grantProductId);
  }
  if (!offer.grantAppId) return false; // misconfigured — skip
  return !owned.appIds.has(offer.grantAppId);
}

// Whether an offer may be SHOWN at all — the display-side counterpart to
// isOfferEligible, used for the checkout bump and any other surface that
// presents an offer.
//
// Two independent reasons to hide one: it has been deactivated, or the buyer
// already has what it grants. The second only became reachable once checkout
// supported signed-in members; before that every buyer was brand new and owned
// nothing, which is why the bump was rendered unconditionally.
//
// Fulfilment calls this same helper (createCheckoutIntent) and finalizeOrder
// re-checks `active` before charging, so display and fulfilment cannot drift.
// An earlier version of this comment claimed a two-sided guard while the
// fulfilment side checked only eligibility, leaving a withdrawn offer
// chargeable from a stale page.
export function shouldShowOffer(
  offer: (GrantTarget & { active: boolean }) | null | undefined,
  owned: Ownership,
): boolean {
  if (!offer || !offer.active) return false;
  return isOfferEligible(offer, owned);
}

// What fulfilling this offer charges the saved card RIGHT NOW. A trial
// subscription is $0 today (charged after the trial) — one-time + trial can
// never be a single charge. A recurring offer without a trial bills its first
// period immediately.
export function immediateChargeCents(offer: {
  billingType: "one_time" | "recurring";
  priceCents: number;
  trialDays: number | null;
}): number {
  if (offer.billingType === "one_time") return offer.priceCents;
  if (offer.trialDays && offer.trialDays > 0) return 0;
  return offer.priceCents;
}

/**
 * Which offer a click on the upsell actually buys.
 *
 * The page shows two prices; the form sends a side, never an id. So the only
 * thing a tampered request can do is pick the alternative it was already
 * shown — and only if the offer declares one, and only if that one is live.
 *
 * Pure and separate from acceptOto because this is the rule that decides what
 * money moves, and a rule that only exists inside a Stripe call is a rule
 * nobody can check.
 */
export function offerForChoice(
  shown: { id: string; altOfferId: string | null },
  alt: { id: string; active: boolean } | null,
  choice: "alt" | undefined,
): string | null {
  if (choice !== "alt") return shown.id;
  if (!shown.altOfferId) return null;
  if (!alt || alt.id !== shown.altOfferId || !alt.active) return null;
  return alt.id;
}

/**
 * The second billing option an offer is saved with.
 *
 * Empty means one price. Its own id means somebody picked the offer they are
 * editing — the database refuses that row, and dropping it here turns a
 * mis-click into nothing rather than into a failed save with a constraint
 * error in the message.
 */
export function altOfferIdFor(chosen: string | undefined | null, selfId?: string | null): string | null {
  const id = (chosen ?? "").trim();
  if (!id || id === selfId) return null;
  return id;
}

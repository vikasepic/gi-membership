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

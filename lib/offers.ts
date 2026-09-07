import type { OfferPrice } from "@/lib/offer-prices";
// Offer eligibility — correctness, not polish (plan): an offer is NEVER shown
// to a buyer who already owns or subscribes to what it grants.

export type Ownership = {
  productIds: Set<string>;
  appIds: Set<string>;
  /**
   * App id -> the channels already held under it.
   *
   * Needed because three Content Engine offers share ONE grant_app_id, so the
   * app id alone cannot tell Instagram from LinkedIn — and collapsing them to
   * a set of app ids made one active subscription block the other two offers
   * entirely. Empty for an app whose held rows grant no channels (the Funnel
   * App, and any row an app reported itself), which is exactly the case the
   * app-id rule still answers.
   */
  appChannels: Map<string, Set<string>>;
};

type GrantTarget = {
  grantType: "product" | "subscription";
  grantProductId: string | null;
  grantAppId: string | null;
  /** What this offer unlocks inside the app. Absent/empty = the whole app. */
  grantChannels?: string[] | null;
};

/**
 * Whether this offer may be sold to this buyer.
 *
 * Channel-aware since one app is sold as three subscriptions. The rule:
 *
 * - An offer granting NO channels is ineligible to anyone holding that app —
 *   byte-for-byte today's behaviour, which is what keeps the Funnel App and
 *   every product offer unchanged.
 * - An offer granting channels needs its channel set to be disjoint from what
 *   the buyer already holds in that app. So an Instagram subscriber may buy
 *   LinkedIn, but not the bundle: the bundle is priced as the sum of the two
 *   singles, and selling it to a half-holder charges for access they have.
 * - Holding the app through a row we cannot attribute channels to blocks it
 *   too. "They hold this app and we don't know which parts" is not a licence
 *   to sell them the parts again.
 */
export function isOfferEligible(offer: GrantTarget, owned: Ownership): boolean {
  if (offer.grantType === "product") {
    if (!offer.grantProductId) return false; // misconfigured — skip
    return !owned.productIds.has(offer.grantProductId);
  }
  if (!offer.grantAppId) return false; // misconfigured — skip
  if (!owned.appIds.has(offer.grantAppId)) return true; // holds none of this app
  const wanted = offer.grantChannels ?? [];
  if (wanted.length === 0) return false;
  const held = owned.appChannels.get(offer.grantAppId);
  if (!held || held.size === 0) return false;
  return wanted.every((c) => !held.has(c));
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
 * The price this offer quotes when nobody has chosen one.
 *
 * The first that is showing, by the order the editor put them in. There is no
 * `is_default` column on purpose: it would be a second key describing what the
 * order already says, and hiding the top price SHOULD promote the next one
 * rather than leave the storefront quoting a price nobody can buy.
 */
export function defaultPriceOf(prices: OfferPrice[]): OfferPrice | null {
  return prices.filter((p) => !p.archived)[0] ?? null;
}

/**
 * The offer, as sold at one of its prices.
 *
 * The whole reason the sixty existing readers did not have to change. They
 * were never reading "the offer's price" — they were reading "the price of the
 * thing being sold", and this hands them exactly that with one fact swapped.
 * Same trick as `offerAsSoldTo`, which strips a trial the buyer has used and
 * lets every reader move together.
 *
 * Anything on the money path must be handed the PROJECTED offer. A raw one
 * type-checks perfectly and charges the headline price to somebody who picked
 * the yearly — `immediateChargeCents` takes a structural
 * `{billingType, priceCents, trialDays}`, so nothing catches it.
 */
export function offerAtPrice<T extends PriceFields>(offer: T, price: OfferPrice | null): T {
  if (!price) return offer;
  return {
    ...offer,
    billingType: price.billingType,
    interval: price.interval,
    intervalCount: price.intervalCount,
    trialDays: price.trialDays,
    priceCents: price.priceCents,
    compareAtCents: price.compareAtCents,
  };
}

type PriceFields = {
  billingType: "one_time" | "recurring";
  interval: string | null;
  intervalCount: number | null;
  trialDays: number | null;
  priceCents: number;
  compareAtCents: number | null;
};

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
  shown: { id: string },
  alt: { id: string; active: boolean } | null,
  choice: "alt" | undefined,
): string | null {
  if (choice !== "alt") return shown.id;
  // `alt` is resolved server-side from the placement — the product's
  // bump_alt_offer_id or upsell_alt_offer_id — and never from the request.
  if (!alt || !alt.active || alt.id === shown.id) return null;
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

/**
 * What the second price saves, in its own terms.
 *
 * Derived from the two prices rather than typed: "5 months free" is a fact
 * about $199 against 12 × $29, and a number someone typed once outlives the
 * next price change and starts lying. Null unless the pair is genuinely a
 * monthly and a yearly of the same thing — anything else is a comparison the
 * page should not be making up.
 */
export function altSaving(
  main: { interval: string | null; priceCents: number },
  alt: { interval: string | null; priceCents: number },
): string | null {
  if (main.interval !== "month" || alt.interval !== "year") return null;
  const full = main.priceCents * 12;
  if (alt.priceCents >= full) return null;
  const months = Math.floor((full - alt.priceCents) / main.priceCents);
  if (months < 1) return null;
  return `${months} month${months === 1 ? "" : "s"} free`;
}

import { money } from "@/lib/money";
import { livePrices, type OfferPrice } from "@/lib/offer-prices";
import { cadenceWords, isPlan } from "@/lib/payment-plans";

/**
 * The two figures a price card may quote beside the price, from the offer
 * itself: the compare-at it is discounted from, and the payment plan it
 * offers. Both derived, never typed — a "$997" struck through on a card
 * outlives the price it was mocking, and a plan line the checkout does not
 * offer is a promise the page cannot keep.
 */
export function planMoney(offer: {
  compareAtCents?: number | null;
  currency: string;
  prices?: OfferPrice[] | null;
}): { compareAtLabel: string | null; planLabel: string | null } {
  const plan = livePrices(offer.prices).find(isPlan);
  const { adverb, every } = plan ? cadenceWords(plan) : { adverb: null, every: "" };
  const amount = plan ? money(plan.priceCents, offer.currency) : "";
  return {
    compareAtLabel: offer.compareAtCents ? money(offer.compareAtCents, offer.currency) : null,
    planLabel: plan
      ? adverb
        ? `${plan.installments} ${adverb} payments of ${amount}`
        : `${plan.installments} payments of ${amount} ${every}`
      : null,
  };
}

import type { BillingType, Interval } from "@/lib/types";

/**
 * The line under a membership price that says the charge out loud.
 *
 * It assumed every offer on the storefront was a subscription, because every
 * one was: "Billed every month. Cancel any time." An app sold once at a fixed
 * price has no interval, and the line came out as "Billed every null." — on
 * the card that sells it. One-time is its own sentence now.
 */
export function membershipTerms(
  offer: { billingType: BillingType; interval: Interval | null; trialDays: number | null },
  price: string,
): { suffix: string | null; terms: string } {
  if (offer.billingType === "one_time" || !offer.interval) {
    return { suffix: null, terms: "One-time payment. Yours to keep." };
  }
  const trial = offer.trialDays ?? 0;
  return {
    suffix: `/${offer.interval}`,
    terms:
      trial > 0
        ? `Free for ${trial} days, then ${price} each ${offer.interval}. Cancel any time before then and you pay nothing.`
        : `Billed every ${offer.interval}. Cancel any time.`,
  };
}

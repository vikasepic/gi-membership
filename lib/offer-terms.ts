import type { BillingType, Interval } from "@/lib/types";
import { isPlan, planSentence } from "@/lib/payment-plans";

/**
 * The line under a membership price that says the charge out loud.
 *
 * It assumed every offer on the storefront was a subscription, because every
 * one was: "Billed every month. Cancel any time." An app sold once at a fixed
 * price has no interval, and the line came out as "Billed every null." — on
 * the card that sells it. One-time is its own sentence now.
 */
export function membershipTerms(
  offer: {
    billingType: BillingType;
    interval: Interval | null;
    intervalCount?: number | null;
    trialDays: number | null;
    installments?: number | null;
  },
  price: string,
): { suffix: string | null; terms: string } {
  // A plan: the count where the interval would go, and the whole arrangement
  // as the terms. "3 monthly payments" is the sentence; "/month" would lie.
  if (isPlan(offer)) {
    return {
      suffix: ` × ${offer.installments}`,
      terms: planSentence(
        {
          installments: offer.installments!,
          interval: offer.interval,
          intervalCount: offer.intervalCount ?? 1,
          trialDays: offer.trialDays,
        },
        price,
      ),
    };
  }
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

/**
 * A payment plan: a recurring price that charges a fixed number of times and
 * then stops, the buyer keeping what they bought.
 *
 * Pure. The Stripe half lives in lib/payment-plans-stripe.ts, the webhook
 * half in lib/subscription-sync.ts; this is the part both can be tested
 * against without either.
 */

export function isPlan(p: { billingType: string; installments?: number | null }): boolean {
  return p.billingType === "recurring" && typeof p.installments === "number" && p.installments >= 2;
}

/** "monthly" and "every month", or null and "every 2 months" when there is no one word for it. */
export function cadenceWords(p: { interval: string | null; intervalCount: number }): {
  adverb: string | null;
  every: string;
} {
  const unit = p.interval ?? "month";
  const n = Math.max(1, Math.round(p.intervalCount || 1));
  const adverbs: Record<string, string> = { day: "daily", week: "weekly", month: "monthly", year: "yearly" };
  if (n === 1 && adverbs[unit]) return { adverb: adverbs[unit], every: `every ${unit}` };
  return { adverb: null, every: `every ${n} ${unit}s` };
}

/**
 * The whole arrangement in one line. `couponTrialDays` replaces the price's
 * own trial the way priceTerms does: null means no code, zero means a code
 * took the trial away.
 */
export function planSentence(
  p: { installments: number; interval: string | null; intervalCount: number; trialDays: number | null },
  amount: string,
  couponTrialDays: number | null = null,
): string {
  const { adverb, every } = cadenceWords(p);
  const body = adverb
    ? `${p.installments} ${adverb} payments of ${amount}, then it's yours`
    : `${p.installments} payments of ${amount} ${every}, then it's yours`;
  const trial = couponTrialDays ?? p.trialDays;
  return trial && trial > 0 ? `${trial} days free, then ${body}` : body;
}

/**
 * What a subscription ending means for a plan.
 *
 * Counted, not trusted: a schedule Stripe ended early after failed retries
 * emits the same deleted event as one that ran its course.
 */
export function planOutcome(installments: number, paidInvoices: number): "paid_off" | "canceled" {
  return paidInvoices >= installments ? "paid_off" : "canceled";
}

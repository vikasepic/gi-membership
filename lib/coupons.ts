import "server-only";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

// Coupons are Stripe promotion codes. Keeping them there rather than in a table
// here means no coupon admin to build, no sync to get wrong, and test-mode codes
// that cannot possibly leak into live — Stripe already partitions them by mode.
//
// The discount is ALWAYS computed on the server from the code alone. A price
// that arrives from the browser is a suggestion, not a fact.

/**
 * Stripe refuses a card charge below this. A coupon generous enough to go under
 * it is clamped rather than rejected: someone testing with a 99%-off code wants
 * a tiny charge, and failing with Stripe's raw "amount must be at least 50"
 * mid-payment is a worse answer than charging the floor and saying so.
 *
 * USD-specific, which matches the store's only currency today.
 */
export const MIN_CHARGE_CENTS = 50;

export type AppliedCoupon = {
  code: string;
  discountCents: number;
  /** Human label for the order summary, e.g. "SAVE20 — 20% off". */
  label: string;
  /** True when the discount was capped by the minimum charge. */
  clamped: boolean;
};

export type CouponResult =
  | { ok: true; coupon: AppliedCoupon }
  | { ok: false; error: string };

/**
 * Validate a code and work out what it takes off `subtotalCents`.
 * Returns a friendly error rather than throwing — an invalid coupon is a normal
 * thing for a buyer to type, not an exception.
 */
export async function resolveCoupon(
  rawCode: string,
  subtotalCents: number,
  currency: string,
): Promise<CouponResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a code." };

  let promo;
  try {
    // The coupon hangs off `promotion` in this API version and is a bare id
    // unless expanded, so ask for the object — the percentages live on it.
    const list = await stripe().promotionCodes.list({
      code,
      active: true,
      limit: 1,
      expand: ["data.promotion.coupon"],
    });
    promo = list.data[0];
  } catch {
    return { ok: false, error: "We couldn't check that code. Try again in a moment." };
  }
  // Deliberately the same message for "no such code" and "expired": telling a
  // stranger which codes exist invites guessing at them.
  if (!promo) return { ok: false, error: "That code isn't valid." };
  if (promo.expires_at && promo.expires_at * 1000 < Date.now()) {
    return { ok: false, error: "That code isn't valid." };
  }

  const c = promo.promotion?.coupon;
  if (!c || typeof c === "string" || !c.valid) {
    return { ok: false, error: "That code isn't valid." };
  }
  if (c.currency && c.currency.toLowerCase() !== currency.toLowerCase()) {
    return { ok: false, error: "That code can't be used on this purchase." };
  }

  // Stripe does not count PaymentIntent redemptions, so enforce the limit
  // against our own paid orders or max_redemptions would mean nothing here.
  if (promo.max_redemptions != null) {
    const db = createServiceClient();
    const { count } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("store_id", await getStoreId())
      .eq("coupon_code", code)
      .eq("status", "paid");
    if ((count ?? 0) >= promo.max_redemptions) {
      return { ok: false, error: "That code has already been fully redeemed." };
    }
  }

  let discount = 0;
  let label = code;
  if (c.percent_off) {
    discount = Math.round((subtotalCents * c.percent_off) / 100);
    label = `${code} — ${c.percent_off}% off`;
  } else if (c.amount_off) {
    discount = c.amount_off;
    label = `${code} — ${(c.amount_off / 100).toFixed(2)} off`;
  } else {
    return { ok: false, error: "That code isn't valid." };
  }

  // Never below the floor, and never negative.
  const maxDiscount = Math.max(0, subtotalCents - MIN_CHARGE_CENTS);
  const clamped = discount > maxDiscount;
  discount = Math.min(discount, maxDiscount);

  if (discount <= 0) {
    return { ok: false, error: "This order is already at the minimum charge." };
  }

  return { ok: true, coupon: { code, discountCents: discount, label, clamped } };
}

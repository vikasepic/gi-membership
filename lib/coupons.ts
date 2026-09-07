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
//
// **This Stripe account is shared with six other apps**, and a promotion code
// is an account-wide object. Until 1 Sep 2026 this file looked a code up by
// name and applied whatever it found, so every other app's codes worked here:
// CONTENT100 and DPBS are both 100% off and neither is ours, and DPBS had
// already been used on seven live orders, each paying the 50c floor against a
// $19 product.
//
// So the rule is DEFAULT DENY. A code works here only if it can show it
// belongs to this store, one of two ways:
//
//   1. Its coupon (or promotion code) carries metadata `store=grow`. Without
//      that it is somebody else's and is refused.
//   2. Optionally, metadata `products=slug,slug` narrows it to named items.
//      Absent means the whole catalogue.
//
// **Not Stripe's own "specific products" restriction.** Verified against this
// API version on 1 Sep 2026: `applies_to` is not returned on the coupon at
// all — not through the promotion code, not on a direct retrieve — and the
// create call accepts it and drops it. So a restriction set in Stripe's UI is
// invisible here and could never be enforced, which is exactly why a coupon
// built for one product was taking money off every other one. Metadata is a
// field we can actually read, so that is the field that decides.

/**
 * Stripe refuses a card charge below this. A coupon generous enough to go under
 * it is clamped rather than rejected: someone testing with a 99%-off code wants
 * a tiny charge, and failing with Stripe's raw "amount must be at least 50"
 * mid-payment is a worse answer than charging the floor and saying so.
 *
 * USD-specific, which matches the store's only currency today.
 */
export const MIN_CHARGE_CENTS = 50;

/**
 * The metadata that marks a coupon as this store's.
 *
 * In Stripe: open the coupon, add metadata `store` = `grow`. Without it the
 * code does nothing here, however valid it is on the account.
 */
export const STORE_TAG = "grow";
export const STORE_META_KEY = "store";

/**
 * Metadata that narrows a coupon to particular items.
 *
 * `products` = a comma-separated list of product slugs or offer keys, e.g.
 * `digital-product-validator,the-idea-vault`. Slugs rather than Stripe ids
 * because a person types this into a Stripe form, and a slug is something they
 * can read off the address bar and check. Absent means the whole catalogue.
 */
export const ITEMS_META_KEY = "products";

/**
 * Metadata that limits a coupon to particular billing periods.
 *
 * `intervals` = a comma-separated list of day|week|month|year. Absent means
 * every interval, which is what every code written before this did.
 *
 * It exists because a duration-based coupon means something very different on
 * a yearly price: `duration: repeating, duration_in_months: 2` discounts the
 * whole ANNUAL invoice, because the next one falls twelve months later, well
 * outside the window. A "2 months free" code on a $199/year plan gives away a
 * free year. DPBS on this account is configured exactly that way.
 */
export const INTERVALS_META_KEY = "intervals";

/**
 * Metadata that replaces the trial length for this purchase.
 *
 * `trial_days` = a whole number of days, 0 to 365. A Stripe coupon cannot
 * extend a trial — it discounts money — so this is the only way to sell "30
 * days free, then the usual price", which is a different promotion from any
 * amount off.
 */
export const TRIAL_DAYS_META_KEY = "trial_days";

/** Which interval is being bought; null for a one-time purchase. */
export type BillingInterval = "day" | "week" | "month" | "year";

/**
 * The trial this coupon grants, or null when it says nothing about one.
 *
 * Nonsense is IGNORED rather than refused. This field is optional, so a typo
 * in it must not take a working discount off the air — the failure would be a
 * code that silently stops working, reported as "the coupon is broken", with
 * nothing pointing at a stray character in an unrelated field.
 *
 * Zero is a real value and distinct from absent: a code may deliberately
 * remove a trial rather than extend one.
 */
export function couponTrialDays(meta: Record<string, string>): number | null {
  const raw = (meta[TRIAL_DAYS_META_KEY] ?? "").trim();
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 0 && n <= 365 ? n : null;
}

/** Whether this coupon may be used on a purchase billed at this interval. */
export function intervalAllowed(
  meta: Record<string, string>,
  interval: BillingInterval | null,
): boolean {
  const only = (meta[INTERVALS_META_KEY] ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (only.length === 0) return true;
  // A one-time charge has no interval, so a code that names one cannot apply.
  if (!interval) return false;
  return only.includes(interval);
}

/**
 * What is being bought, so a code can be checked against it.
 *
 * Required rather than optional on purpose: an optional scope is one every
 * future call site can forget, and forgetting it is exactly the bug this
 * exists to close. The type system now asks the question at every call.
 */
export type CouponScope = {
  /** The product's slug, or the offer's key. */
  item: string;
  /**
   * The billing interval being bought, or null for a one-time purchase.
   *
   * Required rather than optional for the same reason `item` is: an optional
   * scope field is one every future call site can forget, and forgetting it is
   * exactly the bug this exists to close.
   */
  interval: BillingInterval | null;
};

export type AppliedCoupon = {
  code: string;
  /**
   * Stripe's own id for the promotion code.
   *
   * Needed by the subscription path and by nothing else. A PaymentIntent has no
   * concept of a promotion code, so a one-off charge is discounted by
   * subtracting `discountCents`; a subscription is handed the code itself, and
   * Stripe then applies it for however long the coupon says — once, three
   * months, forever. That duration is the merchant's decision, made in Stripe,
   * and re-implementing it here is how the invoice and the receipt start
   * disagreeing.
   */
  promotionCodeId: string;
  discountCents: number;
  /** True when this coupon renews with the subscription rather than applying once. */
  recurringDiscount: boolean;
  /** Human label for the order summary, e.g. "SAVE20 — 20% off". */
  label: string;
  /** True when the discount was capped by the minimum charge. */
  clamped: boolean;
  /**
   * The trial this code grants, replacing the price's own. Null when it says
   * nothing about one, which is every code written before this.
   */
  trialDays: number | null;
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
  scope: CouponScope,
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
  if (c.redeem_by && c.redeem_by * 1000 < Date.now()) {
    return { ok: false, error: "That code isn't valid." };
  }

  // DEFAULT DENY. A promotion code is an account-wide object and this account
  // is shared, so a code has to prove it is ours rather than merely existing.
  const meta = { ...(c.metadata ?? {}), ...(promo.metadata ?? {}) };
  if (meta[STORE_META_KEY] !== STORE_TAG) {
    // Same message as an unknown code. Someone probing another app's codes
    // against this checkout learns nothing about which ones exist.
    return { ok: false, error: "That code isn't valid." };
  }

  // And if it names its items, this has to be one of them.
  const only = (meta[ITEMS_META_KEY] ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (only.length > 0 && !only.includes(scope.item.toLowerCase())) {
    return { ok: false, error: "That code can't be used on this purchase." };
  }

  // And if it names billing periods, this has to be one of them. Same message
  // as a wrong item: the code exists and is simply not for this purchase.
  if (!intervalAllowed(meta, scope.interval)) {
    return { ok: false, error: "That code can't be used on this purchase." };
  }

  // Restrictions Stripe would enforce on a Checkout Session and cannot enforce
  // on a PaymentIntent, so they are ours to apply or they mean nothing.
  const r = promo.restrictions;
  if (r?.minimum_amount != null) {
    const sameCurrency =
      !r.minimum_amount_currency ||
      r.minimum_amount_currency.toLowerCase() === currency.toLowerCase();
    if (!sameCurrency || subtotalCents < r.minimum_amount) {
      return { ok: false, error: "That code can't be used on this purchase." };
    }
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

  const trialDays = couponTrialDays(meta);

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

  // A trial-only code is valid with nothing off. Stripe will not create a
  // coupon with no discount at all, so such a code carries a nominal one — and
  // a nominal percentage rounds to zero cents on a small price, which this
  // guard used to refuse outright. Without this branch a trial-only promotion
  // is impossible to express.
  if (discount <= 0 && trialDays === null) {
    return { ok: false, error: "This order is already at the minimum charge." };
  }

  return {
    ok: true,
    coupon: {
      code,
      promotionCodeId: promo.id,
      discountCents: discount,
      // `duration: "once"` is the common case and the one the display assumes.
      // Anything else keeps discounting later invoices, which the buyer should
      // be told about rather than discovering on their second bill.
      recurringDiscount: c.duration !== "once",
      label,
      clamped,
      trialDays,
    },
  };
}

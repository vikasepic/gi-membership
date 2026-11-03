import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("server-only", () => ({}));
const { subscriptionRowFrom, discountNote } = await import("@/lib/subscriptions");

/**
 * What Stripe will actually take at the next renewal, and why.
 *
 * Asked for 3 Nov 2026: Kerry Watson's Content Engine subscription got a 100%
 * coupon for one charge, and Grow still said "$58 every month, next charge
 * 4 Nov" with nothing to show the $0.
 */

const LINK = { storeId: "st", userId: "u", offerId: "ce", productId: null };
const coupon = (c: Partial<Stripe.Coupon>) =>
  ({ id: "co", object: "coupon", name: null, percent_off: null, amount_off: null, currency: null, duration: "once", duration_in_months: null, ...c }) as Stripe.Coupon;
const discount = (c: Stripe.Coupon) => ({ id: "di", object: "discount", source: { type: "coupon", coupon: c } }) as unknown as Stripe.Discount;
const sub = (over: Partial<Stripe.Subscription> = {}) =>
  ({
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    currency: "usd",
    items: { data: [{ price: { unit_amount: 5800, currency: "usd", recurring: { interval: "month", interval_count: 1 } }, quantity: 1, current_period_start: 1, current_period_end: 2 }] },
    metadata: {},
    discounts: [],
    start_date: 1,
    livemode: true,
    ...over,
  }) as unknown as Stripe.Subscription;

describe("the next charge on a subscription row", () => {
  it("is what Stripe's preview of the next invoice says, and why it is not the price", () => {
    const row = subscriptionRowFrom(
      sub({ discounts: [discount(coupon({ name: "Content Engine free month", percent_off: 100, duration: "once" }))] }),
      [],
      LINK,
      new Date(),
      { amountDue: 0 },
    );
    expect(row.amount_cents).toBe(5800);
    expect(row.next_charge_cents).toBe(0);
    expect(row.next_charge_note).toBe("Content Engine free month: 100% off, this charge only");
  });

  it("is unknown, not zero, when there was no preview to read", () => {
    const row = subscriptionRowFrom(sub(), [], LINK, new Date());
    expect(row.next_charge_cents).toBeNull();
    expect(row.next_charge_note).toBeNull();
  });

  it("has no note when nothing changes the price", () => {
    expect(subscriptionRowFrom(sub(), [], LINK, new Date(), { amountDue: 5800 }).next_charge_note).toBeNull();
  });
});

describe("how a discount reads", () => {
  it("says how long it lasts, in the coupon's own terms", () => {
    expect(discountNote([discount(coupon({ amount_off: 1000, currency: "usd", duration: "repeating", duration_in_months: 3 }))])).toBe(
      "$10 off for 3 months",
    );
    expect(discountNote([discount(coupon({ name: "Founders", percent_off: 20, duration: "forever" }))])).toBe("Founders: 20% off every charge");
    // Kerry's coupon on 3 Nov 2026 was named "content 30d " and read "content 30d : 100% off".
    expect(discountNote([discount(coupon({ name: "content 30d ", percent_off: 100, duration: "repeating", duration_in_months: 1 }))])).toBe("content 30d: 100% off for 1 month");
    expect(discountNote([discount(coupon({ percent_off: 50, duration: "repeating", duration_in_months: 1 }))])).toBe("50% off for 1 month");
  });

  it("reads a discount Stripe left unexpanded as nothing rather than guessing", () => {
    expect(discountNote(["di_123" as unknown as Stripe.Discount])).toBeNull();
    expect(discountNote([])).toBeNull();
    expect(discountNote(null)).toBeNull();
  });
});

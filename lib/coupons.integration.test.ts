import { describe, it, expect, afterAll } from "vitest";
import { stripe } from "@/lib/stripe";
import { resolveCoupon, MIN_CHARGE_CENTS } from "@/lib/coupons";

// Real Stripe test-mode coupons. Skips when Stripe isn't configured.
const canRun = !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_");

const created: { coupons: string[]; promos: string[] } = { coupons: [], promos: [] };

async function makePromo(code: string, opts: { percent_off?: number; amount_off?: number }) {
  const coupon = await stripe().coupons.create({
    ...opts,
    ...(opts.amount_off ? { currency: "usd" } : {}),
    duration: "once",
  });
  created.coupons.push(coupon.id);
  // This API version nests the coupon under `promotion`, both on create and on
  // the returned object.
  const promo = await stripe().promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code,
  });
  created.promos.push(promo.id);
  return promo;
}

describe.skipIf(!canRun)("coupons (integration)", () => {
  it("applies a percentage off the subtotal", async () => {
    const code = `PCT${Date.now()}`;
    await makePromo(code, { percent_off: 50 });

    const res = await resolveCoupon(code, 4999, "usd");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.coupon.discountCents).toBe(2500); // rounds the half cent
    expect(res.coupon.code).toBe(code.toUpperCase());
    expect(res.coupon.clamped).toBe(false);
  });

  it("is case-insensitive about the code the buyer types", async () => {
    const code = `CASE${Date.now()}`;
    await makePromo(code, { percent_off: 10 });
    const res = await resolveCoupon(code.toLowerCase(), 1000, "usd");
    expect(res.ok).toBe(true);
  });

  // The reason this store can be tested with a real card for pennies, and the
  // reason a 100%-off code cannot produce a PaymentIntent Stripe will refuse.
  it("never discounts below the minimum a card can charge", async () => {
    const code = `ALL${Date.now()}`;
    await makePromo(code, { percent_off: 100 });

    const res = await resolveCoupon(code, 499, "usd");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(499 - res.coupon.discountCents).toBe(MIN_CHARGE_CENTS);
    expect(res.coupon.clamped).toBe(true);
  });

  it("rejects an unknown code without saying whether it ever existed", async () => {
    const res = await resolveCoupon("NOPE-DOES-NOT-EXIST", 4999, "usd");
    expect(res).toEqual({ ok: false, error: "That code isn't valid." });
  });

  it("refuses when the order is already at the floor", async () => {
    const code = `FLOOR${Date.now()}`;
    await makePromo(code, { percent_off: 25 });
    const res = await resolveCoupon(code, MIN_CHARGE_CENTS, "usd");
    expect(res.ok).toBe(false);
  });
});

afterAll(async () => {
  if (!canRun) return;
  for (const id of created.promos) {
    await stripe().promotionCodes.update(id, { active: false }).catch(() => {});
  }
  for (const id of created.coupons) {
    await stripe().coupons.del(id).catch(() => {});
  }
});

import { describe, it, expect, afterAll } from "vitest";
import { stripe } from "@/lib/stripe";
import { resolveCoupon, MIN_CHARGE_CENTS, STORE_TAG } from "@/lib/coupons";

// Real Stripe test-mode coupons. Skips when Stripe isn't configured.
const canRun = !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_");

const created: { coupons: string[]; promos: string[]; products: string[] } = {
  coupons: [], promos: [], products: [],
};

/** A scope for tests that are about the discount, not about who owns the code. */
const ANY_PRODUCT = { item: "any-product", interval: null };

async function makePromo(
  code: string,
  opts: { percent_off?: number; amount_off?: number },
  extra: { tagged?: boolean; only?: string[] } = { tagged: true },
) {
  const coupon = await stripe().coupons.create({
    ...opts,
    ...(opts.amount_off ? { currency: "usd" } : {}),
    duration: "once",
    // Default-deny means a code has to prove it is ours. These tests are about
    // the arithmetic, so they say so and move on; the ownership rules have
    // their own tests below.
    metadata: {
      ...(extra.tagged === false ? {} : { store: STORE_TAG }),
      ...(extra.only ? { products: extra.only.join(",") } : {}),
    },
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

    const res = await resolveCoupon(code, 4999, "usd", ANY_PRODUCT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.coupon.discountCents).toBe(2500); // rounds the half cent
    expect(res.coupon.code).toBe(code.toUpperCase());
    expect(res.coupon.clamped).toBe(false);
  });

  it("is case-insensitive about the code the buyer types", async () => {
    const code = `CASE${Date.now()}`;
    await makePromo(code, { percent_off: 10 });
    const res = await resolveCoupon(code.toLowerCase(), 1000, "usd", ANY_PRODUCT);
    expect(res.ok).toBe(true);
  });

  // The reason this store can be tested with a real card for pennies, and the
  // reason a 100%-off code cannot produce a PaymentIntent Stripe will refuse.
  it("never discounts below the minimum a card can charge", async () => {
    const code = `ALL${Date.now()}`;
    await makePromo(code, { percent_off: 100 });

    const res = await resolveCoupon(code, 499, "usd", ANY_PRODUCT);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(499 - res.coupon.discountCents).toBe(MIN_CHARGE_CENTS);
    expect(res.coupon.clamped).toBe(true);
  });

  // The floor is a PaymentIntent rule and a subscription is not one. Stripe is
  // handed the promotion code and applies it to the invoice; a $0 invoice is
  // legal and no card is touched. Clamping here made a 100%-off code on a $29
  // plan read "−$28.50" beside "Due today $0", under a notice telling the buyer
  // about a 50c minimum that was never going to be charged to them.
  it("does not clamp a subscription, where no card is charged today", async () => {
    const code = `SUB${Date.now()}`;
    await makePromo(code, { percent_off: 100 });

    const res = await resolveCoupon(code, 2900, "usd", { item: "content-engine", interval: "month" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.coupon.discountCents).toBe(2900);
    expect(res.coupon.clamped).toBe(false);
  });

  it("rejects an unknown code without saying whether it ever existed", async () => {
    const res = await resolveCoupon("NOPE-DOES-NOT-EXIST", 4999, "usd", ANY_PRODUCT);
    expect(res).toEqual({ ok: false, error: "That code isn't valid." });
  });

  it("refuses when the order is already at the floor", async () => {
    const code = `FLOOR${Date.now()}`;
    await makePromo(code, { percent_off: 25 });
    const res = await resolveCoupon(code, MIN_CHARGE_CENTS, "usd", ANY_PRODUCT);
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

describe.skipIf(!canRun)("a shared Stripe account: whose code is this?", () => {
  it("refuses an untagged code from another app on the account", async () => {
    // The live bug, 1 Sep 2026. This account is shared with six other apps and
    // a promotion code is account-wide, so CONTENT100 and DPBS — both 100% off,
    // neither ours — worked on this checkout. DPBS had already been used on
    // seven live orders, each paying the 50c floor against a $19 product.
    const code = `FOREIGN${Date.now()}`;
    await makePromo(code, { percent_off: 100 }, { tagged: false });

    const res = await resolveCoupon(code, 1900, "usd", { item: "digital-product-validator", interval: null });
    expect(res.ok, "an untagged code must not apply here").toBe(false);
    // Same wording as an unknown code, so probing another app's codes against
    // this checkout reveals nothing about which ones exist.
    if (!res.ok) expect(res.error).toBe("That code isn't valid.");
  });

  it("accepts a tagged code across the whole catalogue", async () => {
    const code = `OURS${Date.now()}`;
    await makePromo(code, { percent_off: 10 });
    const res = await resolveCoupon(code, 1900, "usd", { item: "anything-at-all", interval: null });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.coupon.discountCents).toBe(190);
  });

  it("honours a code named to one product", async () => {
    // The thing that was actually asked for: a code built for one product must
    // not take money off the rest of the catalogue.
    const code = `ONLYONE${Date.now()}`;
    await makePromo(code, { percent_off: 20 }, { only: ["digital-product-validator"] });

    const onIt = await resolveCoupon(code, 1900, "usd", { item: "digital-product-validator", interval: null });
    expect(onIt.ok, "must work on the product it names").toBe(true);

    const elsewhere = await resolveCoupon(code, 1900, "usd", { item: "the-idea-vault", interval: null });
    expect(elsewhere.ok, "must not work on any other product").toBe(false);
  });

  it("matches the item however it was typed into Stripe", async () => {
    // Somebody will type "Digital-Product-Validator" with capitals, or leave a
    // space after the comma. Neither should quietly disable the restriction.
    const code = `CASE${Date.now()}`;
    await makePromo(code, { percent_off: 20 }, { only: ["The-Idea-Vault", " digital-product-validator"] });
    const res = await resolveCoupon(code, 1900, "usd", { item: "DIGITAL-PRODUCT-VALIDATOR", interval: null });
    expect(res.ok).toBe(true);
  });
});

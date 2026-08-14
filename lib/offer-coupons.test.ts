import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Coupons on the offer checkout — the money path, so these are invariants
 * rather than examples.
 *
 * A subscription and a one-off charge take a discount by two completely
 * different mechanisms, and using the wrong one is not a visible bug: it is a
 * silent, permanent over- or under-charge on every renewal.
 */
const offerCheckout = readFileSync("lib/offer-checkout.ts", "utf8");
const checkout = readFileSync("lib/checkout.ts", "utf8");
const form = readFileSync("components/checkout/offer-checkout-form.tsx", "utf8");
const actions = readFileSync("app/(store)/checkout/offer/actions.ts", "utf8");

describe("the browser never decides what a discount is worth", () => {
  it("carries the code on the SetupIntent, not an amount", () => {
    // An amount written into metadata is an amount a tampered preview could
    // have influenced. The code is re-priced on the way back.
    expect(offerCheckout).toContain("couponCode: coupon?.code ?? \"\"");
    expect(offerCheckout).not.toMatch(/metadata:[\s\S]{0,400}discountCents/);
  });

  it("prices it again at fulfilment, from that stored code", () => {
    const complete = offerCheckout.slice(offerCheckout.indexOf("export async function completeOfferCheckout"));
    expect(complete).toContain("si.metadata?.couponCode");
    expect(complete).toContain("resolveCoupon(");
  });

  it("takes the code from the form and nothing else", () => {
    // startOffer's third argument is a string, so there is no shape in which a
    // number from the browser could reach the charge.
    expect(form).toContain("coupon ? couponInput.trim() : null");
  });
});

describe("a subscription is discounted by Stripe, not by us", () => {
  it("hands the promotion code to the subscription", () => {
    const fulfil = checkout.slice(checkout.indexOf("export async function fulfilOffer"));
    expect(fulfil).toContain("promotion_code: coupon.promotionCodeId");
  });

  it("never edits the recurring unit_amount", () => {
    // This is the expensive version of the bug: subtracting the discount from
    // `unit_amount` would discount EVERY renewal, forever, with nothing
    // anywhere saying so.
    const fulfil = checkout.slice(
      checkout.indexOf("export async function fulfilOffer"),
      checkout.indexOf("const charge =", checkout.indexOf("export async function fulfilOffer")),
    );
    expect(fulfil).toContain("unit_amount: offer.priceCents");
    expect(fulfil).not.toMatch(/unit_amount:[^,\n]*coupon/);
  });

  it("discounts a one-off charge by taking money off the amount", () => {
    // A PaymentIntent has no promotion code, so this half is arithmetic — and
    // it may not go under what Stripe will accept.
    const fulfil = checkout.slice(checkout.indexOf("export async function fulfilOffer"));
    expect(fulfil).toContain("Math.max(MIN_CHARGE_CENTS, immediateChargeCents(offer) - coupon.discountCents)");
  });

  it("books the real charge on the order, not the intended one", () => {
    // On a subscription the discount lands on the first REAL invoice, so
    // today's order must record the undiscounted figure — booking a reduction
    // nobody was charged today would put the ledger out by the discount.
    expect(offerCheckout).toContain('offer.billingType !== "recurring"');
    expect(offerCheckout).toContain("total_cents: chargeNow");
    expect(offerCheckout).toContain("subtotal_cents: gross");
  });
});

describe("the cases that make a coupon useless if missed", () => {
  it("prices a trial against what will be billed, not against $0", () => {
    // A trial charges nothing today. Resolving the code against that would
    // refuse every code with "already at the minimum charge" — on exactly the
    // offers where a discount is worth having.
    expect(offerCheckout).toContain("function couponSubtotal");
    expect(offerCheckout).toContain('offer.billingType === "recurring" ? offer.priceCents : chargeNow');
  });

  it("puts the coupon in the idempotency key", () => {
    // Without it, applying a code to an offer somebody had already tried to buy
    // without one returns Stripe's cached subscription from the first attempt —
    // at full price, with no error anywhere.
    const fulfil = checkout.slice(checkout.indexOf("export async function fulfilOffer"));
    expect(fulfil).toContain("coupon ? `_${coupon.promotionCodeId}`");
  });

  it("drops a code that died rather than failing the purchase", () => {
    // Between preview and fulfilment a coupon can expire or hit its limit. The
    // card is already saved and the buyer is committed by then.
    const complete = offerCheckout.slice(offerCheckout.indexOf("export async function completeOfferCheckout"));
    expect(complete).toContain("res.ok ? res.coupon : null");
  });

  it("says whether a subscription discount is once or forever", () => {
    // "20% off" on a subscription means either one bill or every bill, and the
    // buyer otherwise finds out on the second one.
    expect(form).toContain("recurringDiscount");
    expect(form).toContain("Renewals are at the full price.");
  });
});

describe("the preview endpoint is not a code oracle", () => {
  it("requires a signed-in member", () => {
    // An open endpoint that reports which codes are valid is a way to guess at
    // them a few thousand times an hour.
    const preview = actions.slice(actions.indexOf("export async function previewOfferCouponAction"));
    expect(preview).toContain("supabase.auth.getUser()");
    expect(preview).toContain("Please log in first.");
  });
});

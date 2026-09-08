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
    //
    // Scoped to the metadata object itself, not the SetupIntent call: the
    // call site only spells the shorthand `metadata,` — a `discountCents`
    // added straight to `const metadata = {...}` would reach the SetupIntent
    // without that key ever appearing in the call text. The object is shared
    // by both call sites, so this one slice covers both: a one-time offer's
    // PaymentIntent also writes `discountCents` (checked separately below),
    // but that charge happens synchronously in this same call from a coupon
    // resolveCoupon() just re-priced server-side — it is a receipt of money
    // already taken, not a number saved now for a later step to trust
    // instead of recomputing.
    const metadataBlock = offerCheckout.slice(
      offerCheckout.indexOf("const metadata = {"),
      offerCheckout.indexOf("const description"),
    );
    // Fails closed: if either anchor above stops matching (a rename, a
    // reformat), indexOf returns -1 and slice(-1, ...) silently yields "" —
    // and `not.toContain` on "" passes forever. This positive assertion
    // proves the slice actually captured the object, not nothing.
    expect(metadataBlock).toContain("storeId,");
    expect(offerCheckout).toContain("couponCode: coupon?.code ?? \"\"");
    expect(metadataBlock).not.toContain("discountCents");
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
    // (A subscription never reaches the `paid` branch below — only a one-time
    // offer's on-session PaymentIntent does — so `chargeNow` is still what a
    // recurring sale books.)
    expect(offerCheckout).toContain('sold.billingType !== "recurring"');
    // Pinned to the behaviour, not the exact source text: what decides the
    // paid branch is free to change (it once needed a cast to narrow the
    // union of Stripe's two intent types; fix round 1 replaced that with an
    // `si.object` discriminant check instead, dropping the word "paid" from
    // this exact expression) as long as this invariant holds — there is a
    // real branch, and whatever is booked on the side that ISN'T the paid,
    // on-session one (which is every recurring sale; see above) still falls
    // back to the undiscounted `chargeNow`. Fails if that fallback is ever
    // dropped or swapped for a discounted figure; passes through any
    // reasonable reformat of the condition itself.
    // Terminator-anchored (`chargeNow` followed only by `;`, `,` or `)`, not
    // by more expression) so this cannot be satisfied by a regression like
    // `: chargeNow - coupon.discountCents` — chargeNow appearing as the START
    // of a discounted expression rather than the whole booked figure.
    const complete = offerCheckout.slice(offerCheckout.indexOf("export async function completeOfferCheckout"));
    expect(complete).toMatch(/\?[\s\S]{0,160}:\s*chargeNow\s*[;,)]/);
    // subtotal_cents books subtotalCents now, not a bare `gross` — a bump
    // riding the same PaymentIntent (task 10) adds its own money to what the
    // order claims was sold, alongside the host. Still never net of the
    // discount: `gross + bumpNowCents`, not `gross - discount`, is what feeds
    // it, so the invariant this test has always checked — a subscription's
    // booked subtotal is undiscounted — survives the bump unchanged.
    expect(offerCheckout).toContain("subtotal_cents: subtotalCents");
    expect(offerCheckout).toMatch(/const subtotalCents = .*gross \+ bumpNowCents/);
  });

  it("prices the order from the offer as the COUPON sells it", () => {
    // `sold` carries the coupon's trial; `offer` carries the price's. Pricing
    // from `offer` booked $199 on an order Stripe charged $0 for, because the
    // code had turned a no-trial yearly into a 30-day trial — and $0 on one it
    // billed immediately when a code removed a trial. The ledger has to agree
    // with the card, so `sold` must exist before the money is worked out.
    expect(offerCheckout).toContain("const gross = immediateChargeCents(sold)");
    expect(offerCheckout.indexOf("const sold = offerWithCouponTrial")).toBeLessThan(
      offerCheckout.indexOf("const gross = immediateChargeCents"),
    );
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

describe("the two coupon previews agree about who may ask", () => {
  const productActions = readFileSync("app/(store)/checkout/actions.ts", "utf8");
  const offerPreview = actions.slice(actions.indexOf("export async function previewOfferCouponAction"));
  const productPreview = productActions.slice(
    productActions.indexOf("export async function previewCoupon"),
  );

  it("neither asks anybody to log in", () => {
    // The offer one used to, on the reasoning that an open endpoint reporting
    // which codes are valid can be guessed at a few thousand times an hour.
    // True — but the product checkout's preview has always been open, and the
    // offer checkout is public now too, so the wall stopped no attacker and
    // only stopped buyers: anyone willing to enumerate codes is willing to make
    // an account first.
    //
    // Asserted as a PAIR so the two cannot quietly diverge again. If this ever
    // needs closing it needs closing on both, and rate limiting is the answer
    // rather than a session.
    for (const [name, src] of [
      ["offer", offerPreview],
      ["product", productPreview],
    ] as const) {
      expect(src, `${name} preview does not demand a session`).not.toContain("Please log in first.");
    }
  });
});

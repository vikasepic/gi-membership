import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

/**
 * Which function a `payment_intent.succeeded` event reaches.
 *
 * finalizeOrder looks an order up by intent id and quietly no-ops when it
 * can't find one — which is always, for a standalone offer, since
 * offer-checkout.ts never writes the order row until completeOfferCheckout
 * runs. Before this fix the webhook was the only server-side backstop for a
 * buyer who closed the tab after confirming, and it did nothing for exactly
 * the case it needed to cover. offerId is the discriminant (a product's
 * PaymentIntent carries productId/bumpOfferId instead), so this checks
 * routing both ways: an offer PI must NOT reach finalizeOrder, and a product
 * PI must NOT reach completeOfferCheckout.
 *
 * Signature verification is mocked away — stripe().webhooks.constructEvent is
 * stubbed to hand back a fixed event — because this test is about the
 * dispatch after the event is parsed, not about HMAC verification.
 */

let fakeEvent: { type: string; data: { object: unknown } };
vi.mock("@/lib/stripe", async (orig) => ({
  ...(await orig<typeof import("@/lib/stripe")>()),
  // completeOfferCheckout and finalizeOrder are both mocked out below, so
  // nothing in this test path ever reaches paymentIntents/setupIntents.retrieve
  // — only constructEvent, to get a fixed event past signature verification.
  stripe: () => ({ webhooks: { constructEvent: () => fakeEvent } }),
}));

const finalizeOrder = vi.fn(async () => {});
vi.mock("@/lib/checkout", async (orig) => ({
  ...(await orig<typeof import("@/lib/checkout")>()),
  finalizeOrder,
}));

// Typed as the real completeOfferCheckout's return shape (not narrowed via
// `as const`) — the redelivery tests below need to hand back `{ ok: false,
// error }` from individual cases via mockResolvedValueOnce.
const completeOfferCheckout = vi.fn(
  async (): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }),
);
vi.mock("@/lib/offer-checkout", async (orig) => ({
  ...(await orig<typeof import("@/lib/offer-checkout")>()),
  completeOfferCheckout,
}));

const { POST } = await import("@/app/api/webhooks/stripe/route");

const ORIGINAL_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

function post() {
  return POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": "test-sig" },
      body: "{}",
    }),
  );
}

describe("payment_intent.succeeded routing", () => {
  beforeEach(() => {
    // Not what's being tested here — constructEvent is stubbed regardless —
    // just the gate the route checks before it. Forced rather than relied on,
    // so this test doesn't depend on .env.local carrying a real value.
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    finalizeOrder.mockClear();
    completeOfferCheckout.mockClear();
  });

  afterAll(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = ORIGINAL_SECRET;
  });

  it("an offer PaymentIntent reaches completeOfferCheckout, not finalizeOrder", async () => {
    fakeEvent = {
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_offer_1", metadata: { offerId: "offer_1" } } },
    };
    await post();
    expect(completeOfferCheckout).toHaveBeenCalledWith("pi_offer_1");
    expect(finalizeOrder).not.toHaveBeenCalled();
  });

  it("a product PaymentIntent still reaches finalizeOrder, not completeOfferCheckout", async () => {
    fakeEvent = {
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_product_1", metadata: { productId: "product_1", bumpOfferId: "" } } },
    };
    await post();
    expect(finalizeOrder).toHaveBeenCalledWith("pi_product_1");
    expect(completeOfferCheckout).not.toHaveBeenCalled();
  });
});

/**
 * Whether a failed completeOfferCheckout gets Stripe to redeliver.
 *
 * The webhook is the only server-side backstop for a buyer who closed the tab
 * after confirming — see the routing describe above. That backstop is no use
 * if a failure it CAN heal on a second pass returns 200 anyway: Stripe only
 * retries a webhook that did not answer with a 2xx, so a swallowed failure
 * here means money taken, no order, no ownership, and nothing that ever tries
 * again. Equally, throwing on a PERMANENT failure (an inactive offer, a
 * foreign intent's metadata) would have Stripe hammer this endpoint for up to
 * three days over something no redelivery can ever fix.
 */
describe("payment_intent.succeeded / an offer failure that can heal on retry", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    finalizeOrder.mockClear();
    completeOfferCheckout.mockClear();
  });

  afterAll(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = ORIGINAL_SECRET;
  });

  it.each(["order_failed", "grant_failed"])(
    "throws so Stripe redelivers when completeOfferCheckout returns %s",
    async (error) => {
      fakeEvent = {
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_offer_retryable", metadata: { offerId: "offer_1" } } },
      };
      completeOfferCheckout.mockResolvedValueOnce({ ok: false, error });
      await expect(post()).rejects.toThrow();
    },
  );

  it.each(["unavailable", "unknown_intent_metadata"])(
    "answers 200 (no redelivery) when completeOfferCheckout returns the permanent failure %s",
    async (error) => {
      fakeEvent = {
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_offer_permanent", metadata: { offerId: "offer_1" } } },
      };
      completeOfferCheckout.mockResolvedValueOnce({ ok: false, error });
      const res = await post();
      expect(res.status).toBe(200);
    },
  );

  it("answers 200 on success, same as always", async () => {
    fakeEvent = {
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_offer_ok", metadata: { offerId: "offer_1" } } },
    };
    completeOfferCheckout.mockResolvedValueOnce({ ok: true });
    const res = await post();
    expect(res.status).toBe(200);
  });
});

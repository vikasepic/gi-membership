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
  stripe: () => ({ webhooks: { constructEvent: () => fakeEvent }, invoices: { list: invoicesList } }),
}));

const orderForPaymentIntent = vi.fn(async (_pi: string): Promise<{ id: string; currency: string } | null> => null);
const orderForInvoicePayment = vi.fn(async (_pi: string): Promise<{ id: string; currency: string } | null> => null);
vi.mock("@/lib/orders", async (orig) => ({
  ...(await orig<typeof import("@/lib/orders")>()),
  orderForPaymentIntent: (pi: string) => orderForPaymentIntent(pi),
  orderForInvoicePayment: (pi: string) => orderForInvoicePayment(pi),
}));
const pushSubscriptionToApps = vi.fn(async (_sub: string) => {});
vi.mock("@/lib/app-sync", async (orig) => ({
  ...(await orig<typeof import("@/lib/app-sync")>()),
  pushSubscriptionToApps: (sub: string) => pushSubscriptionToApps(sub),
}));
const recordRenewal = vi.fn(async (_i: unknown) => ({ recorded: true, orderId: "ord_r", amountCents: 2900 }));
vi.mock("@/lib/renewals", async (orig) => ({
  ...(await orig<typeof import("@/lib/renewals")>()),
  recordRenewal: (i: unknown) => recordRenewal(i),
}));
vi.mock("@/lib/subscriptions", async (orig) => ({
  ...(await orig<typeof import("@/lib/subscriptions")>()),
  syncSubscriptionQuietly: async () => {},
}));
const reportReversal = vi.fn(async (_a: Record<string, unknown>) => {});
vi.mock("@/lib/reversals", async (orig) => ({
  ...(await orig<typeof import("@/lib/reversals")>()),
  reportReversal: (a: Record<string, unknown>) => reportReversal(a),
}));

const invoicesList = vi.fn(async (): Promise<{ data: { status: string; amount_paid: number }[] }> => ({ data: [] }));
const syncSubscriptionOwnership = vi.fn(async () => {});
const markPlanPaidOff = vi.fn(async () => ({ paidOff: 1 }));
const revokeOwnershipForPaymentIntent = vi.fn(async () => ({ revoked: 0 }));
const revokeOwnershipForOrder = vi.fn(async () => ({ revoked: 1 }));
vi.mock("@/lib/subscription-sync", async (orig) => ({
  ...(await orig<typeof import("@/lib/subscription-sync")>()),
  syncSubscriptionOwnership,
  markPlanPaidOff,
  revokeOwnershipForPaymentIntent,
  revokeOwnershipForOrder,
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

/**
 * What the end of a payment plan means.
 *
 * A schedule that ran its course and one Stripe gave up on after failed
 * retries both end in customer.subscription.deleted. The invoices are what
 * tell them apart, and only a paid invoice with money on it counts: the $0
 * one a trial opens with is not an instalment.
 */
describe("customer.subscription.deleted on a plan", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    syncSubscriptionOwnership.mockClear();
    markPlanPaidOff.mockClear();
    invoicesList.mockReset();
  });
  const deleted = (installments?: string) => {
    fakeEvent = {
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_p", metadata: installments ? { installments } : {} } },
    };
  };
  const invoices = (paid: number[]) =>
    invoicesList.mockResolvedValue({ data: paid.map((amount_paid) => ({ status: "paid", amount_paid })) });

  it("pays off after every instalment is paid", async () => {
    deleted("3");
    invoices([19900, 19900, 19900]);
    await post();
    expect(markPlanPaidOff).toHaveBeenCalledWith("sub_p");
    expect(syncSubscriptionOwnership).not.toHaveBeenCalled();
  });
  it("cancels when Stripe gave up early", async () => {
    deleted("3");
    invoices([19900, 19900]);
    await post();
    expect(syncSubscriptionOwnership).toHaveBeenCalledWith("sub_p", "canceled");
    expect(markPlanPaidOff).not.toHaveBeenCalled();
  });
  it("does not count the trial's $0 invoice", async () => {
    deleted("3");
    invoices([0, 19900, 19900]);
    await post();
    expect(syncSubscriptionOwnership).toHaveBeenCalledWith("sub_p", "canceled");
  });
  it("treats a subscription with no instalments as it always did", async () => {
    deleted();
    await post();
    expect(syncSubscriptionOwnership).toHaveBeenCalledWith("sub_p", "canceled");
    expect(invoicesList).not.toHaveBeenCalled();
  });
});

/**
 * A refund on a RENEWAL. The renewal order carries the Stripe invoice, not a
 * PaymentIntent, so the lookup by PaymentIntent finds nothing: on 1 Oct 2026
 * a Funnel App renewal refunded by hand revoked nothing and reported no
 * reversal, leaving the sale counted in Meta's revenue.
 */
describe("charge.refunded on a renewal", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    orderForPaymentIntent.mockClear();
    orderForInvoicePayment.mockClear();
    revokeOwnershipForOrder.mockClear();
    reportReversal.mockClear();
    fakeEvent = {
      type: "charge.refunded",
      data: { object: { id: "ch_r", payment_intent: "pi_renewal", amount_refunded: 2900, currency: "usd" } },
    };
  });

  it("finds the order through the invoice the charge paid, revokes it and reports the reversal", async () => {
    orderForInvoicePayment.mockImplementation(async (pi) => (pi === "pi_renewal" ? { id: "ord_renewal", currency: "usd" } : null));
    await post();
    expect(revokeOwnershipForOrder).toHaveBeenCalledWith("ord_renewal");
    expect(reportReversal).toHaveBeenCalledWith(expect.objectContaining({ orderId: "ord_renewal", amountCents: 2900, kind: "Refund", stripeId: "ch_r" }));
  });

  it("does not go looking through invoices when the PaymentIntent is an order's own", async () => {
    orderForPaymentIntent.mockImplementation(async () => ({ id: "ord_checkout", currency: "usd" }));
    await post();
    expect(orderForInvoicePayment).not.toHaveBeenCalled();
    expect(revokeOwnershipForOrder).not.toHaveBeenCalled();
    expect(reportReversal).toHaveBeenCalledWith(expect.objectContaining({ orderId: "ord_checkout" }));
  });
});

/**
 * A paid renewal tells the app. Before 1 Oct 2026 nothing did: the app heard
 * the same "active" from the subscription update and nothing about the money,
 * so it could not show when a member was last charged or next will be.
 */
describe("invoice.payment_succeeded", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    pushSubscriptionToApps.mockClear();
  });

  it("pushes the subscription's state, billing and all, to its apps", async () => {
    fakeEvent = {
      type: "invoice.payment_succeeded",
      data: { object: { id: "in_1", billing_reason: "subscription_cycle", parent: { subscription_details: { subscription: "sub_paid" } }, lines: { data: [] } } },
    };
    await post();
    expect(pushSubscriptionToApps).toHaveBeenCalledWith("sub_paid");
  });

  it("pushes nothing for an invoice with no subscription", async () => {
    fakeEvent = { type: "invoice.payment_succeeded", data: { object: { id: "in_2", billing_reason: "manual", lines: { data: [] } } } };
    await post();
    expect(pushSubscriptionToApps).not.toHaveBeenCalled();
  });
});

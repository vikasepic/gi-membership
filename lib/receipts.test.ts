import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * What the account page shows for each purchase: Stripe's receipt and Stripe's
 * invoice (spec: docs/superpowers/specs/2026-11-13-stripe-invoice-per-purchase-design.md),
 * and for money that went back, how much.
 *
 * A refunded renewal showed "No receipt" and its invoice still read $398 paid
 * with nothing beside it (aafarrugia@gmail.com, 1 Oct 2026). A renewal has
 * no receipt of its own on the order; its document is the invoice, and the
 * invoice shows a refund through its credit notes.
 */

const tables = vi.hoisted(() => ({ orders: [] as Record<string, unknown>[], order_items: [] as Record<string, unknown>[] }));
// Any chain of filters resolves to the table's rows: these tests are about
// what is done with the rows, not which rows the query picks.
const chain = (rows: Record<string, unknown>[]): unknown =>
  new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "then") return (res: (v: unknown) => void) => res({ data: rows });
        if (prop === "maybeSingle") return async () => ({ data: rows[0] ?? null });
        return () => chain(rows);
      },
    },
  );
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ from: (t: keyof typeof tables) => chain(tables[t]) }) }));
vi.mock("@/lib/store", () => ({ getStoreId: async () => "store" }));

type Obj = Record<string, unknown>;
const stripeState = vi.hoisted(() => ({
  invoices: [] as Obj[],
  creditNotes: [] as Obj[],
  pi: {} as Obj,
  calls: 0,
}));
const paid = (id: string, extra: Obj = {}) => ({
  id, status: "paid", hosted_invoice_url: `https://invoice.stripe.com/${id}`, invoice_pdf: `https://pdf/${id}`, amount_paid: 2900,
  // Stripe's real shape: expanding deeper than four levels is refused, so the payment carries only the PaymentIntent's id.
  payments: { data: [{ payment: { type: "payment_intent", payment_intent: `pi_of_${id}` } }] },
  ...extra,
});
vi.mock("@/lib/stripe", () => ({
  stripeMode: () => "test",
  stripe: () => {
    stripeState.calls++;
    return {
      invoices: {
        list: async (p: { subscription?: string }) => ({
          data: stripeState.invoices.filter((i) => !p.subscription || (i.parent as Obj | undefined)?.subscription_details && ((i.parent as Obj).subscription_details as Obj).subscription === p.subscription),
        }),
        retrieve: async (id: string, p?: { expand?: string[] }) => {
          if ((p?.expand ?? []).some((e) => e.split(".").filter((s) => s !== "data").length > 4 || e.split(".").length > 4)) {
            throw new Error("You cannot expand more than 4 levels of a property.");
          }
          return stripeState.invoices.find((i) => i.id === id);
        },
      },
      creditNotes: { list: async () => ({ data: stripeState.creditNotes }) },
      paymentIntents: {
        retrieve: async (id: string) =>
          id.startsWith("pi_of_")
            ? { id, latest_charge: { receipt_url: `https://pay.stripe.com/receipts/${id.slice(6)}` } }
            : stripeState.pi,
      },
    };
  },
}));

const { purchaseDocsForUser, subscriptionInvoicesForUser } = await import("@/lib/receipts");

const order = (o: Obj) => ({
  created_at: "2026-09-10T10:00:00Z", updated_at: "2026-09-10T10:00:00Z", currency: "usd", status: "paid", livemode: false,
  stripe_payment_intent_id: null, stripe_invoice_id: null, stripe_customer_id: "cus_1", ...o,
});
const sub = (s: string) => ({ parent: { subscription_details: { subscription: s } } });

beforeEach(() => {
  tables.orders = [];
  tables.order_items = [];
  stripeState.invoices = [];
  stripeState.creditNotes = [];
  stripeState.pi = {};
  stripeState.calls = 0;
});

describe("subscription invoices", () => {
  it("say how much was refunded, with the credit note to download", async () => {
    tables.orders = [{ stripe_customer_id: "cus_1" }];
    stripeState.invoices = [
      { id: "in_1", number: "SK2J4URK-0002", created: 1790000000, amount_paid: 39800, currency: "usd", invoice_pdf: "https://pdf/in_1", hosted_invoice_url: "https://inv/in_1", post_payment_credit_notes_amount: 39800, ...sub("sub_1") },
      { id: "in_2", number: "SK2J4URK-0003", created: 1790100000, amount_paid: 2900, currency: "usd", invoice_pdf: null, hosted_invoice_url: null, post_payment_credit_notes_amount: 0, ...sub("sub_1") },
    ];
    stripeState.creditNotes = [{ invoice: "in_1", pdf: "https://pdf/cn_1", status: "issued" }];
    const inv = await subscriptionInvoicesForUser("u1");
    expect(inv[0]).toMatchObject({ id: "in_1", refundedCents: 39800, creditNotePdfUrl: "https://pdf/cn_1" });
    expect(inv[1]).toMatchObject({ id: "in_2", refundedCents: 0, creditNotePdfUrl: null });
  });

  it("leave out an invoice made for a one-off purchase", async () => {
    tables.orders = [{ stripe_customer_id: "cus_1" }];
    stripeState.invoices = [
      { id: "in_sub", number: "A-1", created: 1, amount_paid: 2900, currency: "usd", ...sub("sub_1") },
      { id: "in_oneoff", number: "A-2", created: 2, amount_paid: 29700, currency: "usd", parent: null, metadata: { store_created: "true" } },
    ];
    expect((await subscriptionInvoicesForUser("u1")).map((i) => i.id)).toEqual(["in_sub"]);
  });
});

describe("purchases", () => {
  it("a renewal shows its invoice and the receipt of the charge that paid it", async () => {
    tables.orders = [order({ id: "o1", created_at: "2026-09-28T14:25:00Z", updated_at: "2026-09-30T08:32:09Z", total_cents: 39800, status: "refunded", stripe_invoice_id: "in_1" })];
    // With its offer: a renewal line with neither offer nor product is one a
    // connected app billed, which the page leaves out on purpose.
    tables.order_items = [{ order_id: "o1", description: "1 × Content Engine", kind: "renewal", stripe_subscription_id: "sub_1", offer_id: "ce", product_id: null }];
    stripeState.invoices = [paid("in_1", sub("sub_1"))];
    const [doc] = await purchaseDocsForUser("u1");
    expect(doc).toMatchObject({
      invoiceId: "in_1", status: "refunded", refundedAt: "2026-09-30T08:32:09Z",
      invoiceUrl: "https://invoice.stripe.com/in_1", receiptUrl: "https://pay.stripe.com/receipts/in_1", canMakeInvoice: false,
    });
  });

  it("a one-off with no invoice yet has its receipt and can make one", async () => {
    tables.orders = [order({ id: "o3", total_cents: 5000, stripe_payment_intent_id: "pi_3" })];
    tables.order_items = [{ order_id: "o3", description: "Guide", kind: "product", stripe_subscription_id: null, offer_id: null, product_id: "p1" }];
    stripeState.pi = { amount_received: 5000, metadata: {}, latest_charge: { receipt_url: "https://receipt/3", amount_refunded: 0 } };
    const [doc] = await purchaseDocsForUser("u1");
    expect(doc).toMatchObject({ receiptUrl: "https://receipt/3", invoiceUrl: null, canMakeInvoice: true, refundedCents: 0, refundedAt: null });
  });

  it("a one-off whose invoice exists links it and can't make another", async () => {
    tables.orders = [order({ id: "o4", total_cents: 29700, stripe_payment_intent_id: "pi_4" })];
    tables.order_items = [{ order_id: "o4", description: "Foundations Weekend", kind: "oto", stripe_subscription_id: null, offer_id: "fw", product_id: null }];
    stripeState.pi = { amount_received: 29700, metadata: { grow_invoice_id: "in_4" }, latest_charge: { receipt_url: "https://receipt/4", amount_refunded: 0 } };
    stripeState.invoices = [paid("in_4", { parent: null })];
    const [doc] = await purchaseDocsForUser("u1");
    expect(doc).toMatchObject({ receiptUrl: "https://receipt/4", invoiceUrl: "https://invoice.stripe.com/in_4", canMakeInvoice: false });
  });

  it("a one-off whose remembered invoice was voided can make a new one", async () => {
    tables.orders = [order({ id: "o5", total_cents: 29700, stripe_payment_intent_id: "pi_5" })];
    tables.order_items = [{ order_id: "o5", description: "Foundations Weekend", kind: "oto", stripe_subscription_id: null, offer_id: "fw", product_id: null }];
    stripeState.pi = { amount_received: 29700, metadata: { grow_invoice_id: "in_5" }, latest_charge: { receipt_url: "https://receipt/5", amount_refunded: 0 } };
    stripeState.invoices = [{ id: "in_5", status: "void" }];
    const [doc] = await purchaseDocsForUser("u1");
    expect(doc).toMatchObject({ invoiceUrl: null, canMakeInvoice: true });
  });

  it("a refunded checkout says how much went back, and still offers its invoice", async () => {
    tables.orders = [order({ id: "o2", updated_at: "2026-09-10T11:00:00Z", total_cents: 5000, status: "refunded", stripe_payment_intent_id: "pi_2" })];
    tables.order_items = [{ order_id: "o2", description: "Guide", kind: "product", stripe_subscription_id: null, offer_id: null, product_id: "p1" }];
    stripeState.pi = { amount_received: 5000, metadata: {}, latest_charge: { receipt_url: "https://receipt/2", amount_refunded: 2500 } };
    const [doc] = await purchaseDocsForUser("u1");
    expect(doc).toMatchObject({ refundedCents: 2500, receiptUrl: "https://receipt/2", invoiceId: null, canMakeInvoice: true });
  });

  it("a subscription's paid first charge shows the invoice Stripe made at the start", async () => {
    tables.orders = [order({ id: "o6", total_cents: 166700 })];
    tables.order_items = [{ order_id: "o6", description: "Payment plan", kind: "oto", stripe_subscription_id: "sub_6", offer_id: "ai", product_id: null }];
    stripeState.invoices = [
      paid("in_6a", { ...sub("sub_6"), billing_reason: "subscription_cycle", amount_paid: 166700 }),
      paid("in_6", { ...sub("sub_6"), billing_reason: "subscription_create", amount_paid: 166700 }),
    ];
    const [doc] = await purchaseDocsForUser("u1");
    expect(doc).toMatchObject({ invoiceUrl: "https://invoice.stripe.com/in_6", receiptUrl: "https://pay.stripe.com/receipts/in_6", canMakeInvoice: false });
  });

  it("a $0 order has neither", async () => {
    tables.orders = [order({ id: "o7", total_cents: 0 })];
    tables.order_items = [{ order_id: "o7", description: "Trial", kind: "oto", stripe_subscription_id: "sub_7", offer_id: "ce", product_id: null }];
    stripeState.invoices = [paid("in_7", { ...sub("sub_7"), billing_reason: "subscription_create", amount_paid: 0 })];
    const [doc] = await purchaseDocsForUser("u1");
    expect(doc).toMatchObject({ invoiceUrl: null, receiptUrl: null, canMakeInvoice: false });
  });

  it("an order from the other Stripe mode shows nothing and asks Stripe nothing", async () => {
    tables.orders = [order({ id: "o8", total_cents: 5000, livemode: true, stripe_payment_intent_id: "pi_8" })];
    tables.order_items = [{ order_id: "o8", description: "Guide", kind: "product", stripe_subscription_id: null, offer_id: null, product_id: "p1" }];
    const [doc] = await purchaseDocsForUser("u1");
    expect(doc).toMatchObject({ invoiceUrl: null, receiptUrl: null, canMakeInvoice: false });
    expect(stripeState.calls).toBe(0);
  });
});

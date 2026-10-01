import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * What the account page shows for money that went back.
 *
 * A refunded renewal showed "No receipt" and its invoice still read $398 paid
 * with nothing beside it (aafarrugia@gmail.com, 1 Oct 2026). A renewal has
 * no receipt of its own; its document is the invoice, and the invoice shows
 * a refund through its credit notes.
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

const stripeState = vi.hoisted(() => ({
  invoices: [] as Record<string, unknown>[],
  creditNotes: [] as Record<string, unknown>[],
  charge: null as Record<string, unknown> | null,
}));
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    invoices: { list: async () => ({ data: stripeState.invoices }) },
    creditNotes: { list: async () => ({ data: stripeState.creditNotes }) },
    paymentIntents: { retrieve: async () => ({ latest_charge: stripeState.charge }) },
  }),
}));

const { purchaseDocsForUser, subscriptionInvoicesForUser } = await import("@/lib/receipts");

beforeEach(() => {
  tables.orders = [];
  tables.order_items = [];
  stripeState.invoices = [];
  stripeState.creditNotes = [];
  stripeState.charge = null;
});

describe("subscription invoices", () => {
  it("say how much was refunded, with the credit note to download", async () => {
    tables.orders = [{ stripe_customer_id: "cus_1" }];
    stripeState.invoices = [
      { id: "in_1", number: "SK2J4URK-0002", created: 1790000000, amount_paid: 39800, currency: "usd", invoice_pdf: "https://pdf/in_1", hosted_invoice_url: "https://inv/in_1", post_payment_credit_notes_amount: 39800 },
      { id: "in_2", number: "SK2J4URK-0003", created: 1790100000, amount_paid: 2900, currency: "usd", invoice_pdf: null, hosted_invoice_url: null, post_payment_credit_notes_amount: 0 },
    ];
    stripeState.creditNotes = [{ invoice: "in_1", pdf: "https://pdf/cn_1", status: "issued" }];
    const inv = await subscriptionInvoicesForUser("u1");
    expect(inv[0]).toMatchObject({ id: "in_1", refundedCents: 39800, creditNotePdfUrl: "https://pdf/cn_1" });
    expect(inv[1]).toMatchObject({ id: "in_2", refundedCents: 0, creditNotePdfUrl: null });
  });
});

describe("purchases", () => {
  it("a renewal carries its invoice id, so the page can link the invoice instead of 'No receipt'", async () => {
    tables.orders = [{ id: "o1", created_at: "2026-09-28T14:25:00Z", updated_at: "2026-09-30T08:32:09Z", total_cents: 39800, currency: "usd", status: "refunded", stripe_payment_intent_id: null, stripe_invoice_id: "in_1" }];
    // With its offer: a renewal line with neither offer nor product is one a
    // connected app billed, which the page leaves out on purpose.
    tables.order_items = [{ order_id: "o1", description: "1 × Content Engine", kind: "renewal", stripe_subscription_id: "sub_1", offer_id: "ce", product_id: null }];
    const [doc] = await purchaseDocsForUser("u1");
    expect(doc).toMatchObject({ invoiceId: "in_1", status: "refunded", refundedAt: "2026-09-30T08:32:09Z" });
  });

  it("a refunded checkout says how much went back, from Stripe's charge", async () => {
    tables.orders = [{ id: "o2", created_at: "2026-09-10T10:00:00Z", updated_at: "2026-09-10T11:00:00Z", total_cents: 5000, currency: "usd", status: "refunded", stripe_payment_intent_id: "pi_2", stripe_invoice_id: null }];
    tables.order_items = [{ order_id: "o2", description: "Guide", kind: "product", stripe_subscription_id: null, offer_id: null, product_id: "p1" }];
    stripeState.charge = { receipt_url: "https://receipt/2", amount_refunded: 2500 };
    const [doc] = await purchaseDocsForUser("u1");
    expect(doc).toMatchObject({ refundedCents: 2500, documentUrl: "https://receipt/2", invoiceId: null });
  });

  it("a paid purchase has nothing refunded", async () => {
    tables.orders = [{ id: "o3", created_at: "2026-09-10T10:00:00Z", updated_at: "2026-09-10T10:00:00Z", total_cents: 5000, currency: "usd", status: "paid", stripe_payment_intent_id: "pi_3", stripe_invoice_id: null }];
    tables.order_items = [{ order_id: "o3", description: "Guide", kind: "product", stripe_subscription_id: null, offer_id: null, product_id: "p1" }];
    stripeState.charge = { receipt_url: "https://receipt/3", amount_refunded: 0 };
    const [doc] = await purchaseDocsForUser("u1");
    expect(doc).toMatchObject({ refundedCents: 0, refundedAt: null });
  });
});

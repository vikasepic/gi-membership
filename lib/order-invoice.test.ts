import { describe, it, expect, vi, beforeEach } from "vitest";

/** The pure parts and the guards of lib/order-invoice.ts, against a mocked store and Stripe. */

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));
const mode = vi.hoisted(() => ({ live: false }));
const s = vi.hoisted(() => ({
  pi: {} as Row,
  customer: {} as Row,
  invoices: {} as Record<string, Row>,
  calls: [] as string[],
}));
const recordError = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const ins: [string, unknown[]][] = [];
      const rows = () =>
        (db.tables[table] ?? []).filter(
          (r) => filters.every(([k, v]) => r[k] === v) && ins.every(([k, vs]) => vs.includes(r[k])),
        );
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push([k, v]), q),
        in: (k: string, vs: unknown[]) => (ins.push([k, vs]), q),
        order: () => q,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (ok: (r: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/errors", () => ({ recordError, messageOf: (e: unknown) => String(e) }));
vi.mock("@/lib/stripe", () => {
  const client = {
    paymentIntents: {
      retrieve: async () => s.pi,
      update: async (_id: string, p: { metadata: Row }) => {
        s.calls.push("pi.update");
        s.pi = { ...s.pi, metadata: { ...(s.pi.metadata as Row), ...p.metadata } };
        return s.pi;
      },
    },
    customers: {
      retrieve: async () => s.customer,
      update: async (_id: string, p: Row) => (s.calls.push(`customers.update:${p.name}`), { ...s.customer, ...p }),
    },
    invoices: {
      create: async (p: Row) => {
        s.calls.push("invoices.create");
        const inv = { id: `in_${Object.keys(s.invoices).length + 1}`, status: "draft", lines: { data: [] }, ...p };
        s.invoices[inv.id] = inv;
        return inv;
      },
      retrieve: async (id: string) => s.invoices[id],
      // Stripe applies the customer's balance at finalize: amount_due is the lines plus it.
      finalizeInvoice: async (id: string) => {
        const inv = s.invoices[id];
        const lines = (inv.lines as { data: { amount: number }[] }).data;
        const bal = (s.customer.balance as number) ?? 0;
        Object.assign(inv, { status: "open", starting_balance: bal, amount_due: Math.max(0, lines.reduce((n, l) => n + l.amount, 0) + bal) });
        return inv;
      },
      voidInvoice: async (id: string) => (s.calls.push("invoices.void"), (s.invoices[id].status = "void"), s.invoices[id]),
      attachPayment: async (id: string) => ((s.invoices[id].status = "paid"), s.invoices[id]),
      pay: async (id: string) => (s.calls.push("invoices.pay"), (s.invoices[id].status = "paid"), s.invoices[id]),
    },
    invoiceItems: {
      create: async (p: Row) => {
        s.calls.push("invoiceItems.create");
        (s.invoices[p.invoice as string].lines as { data: Row[] }).data.push(p);
        return p;
      },
    },
  };
  return { stripeMode: () => (mode.live ? "live" : "test"), stripe: () => client };
});

const { invoiceLines, couponMemo, invoiceForOrder } = await import("@/lib/order-invoice");

const ORDER = {
  id: "o1", user_id: "u1", status: "paid", livemode: false, created_at: "2026-11-10T12:00:00Z", currency: "usd",
  total_cents: 29700, coupon_code: null, discount_cents: 0, tax_cents: 0,
  stripe_payment_intent_id: "pi_1", stripe_customer_id: "cus_1", stripe_invoice_id: null,
};
const created = () => s.calls.filter((c) => c === "invoices.create").length;

beforeEach(() => {
  vi.clearAllMocks();
  mode.live = false;
  db.tables = {
    orders: [{ ...ORDER }],
    order_items: [{ order_id: "o1", description: "Foundations Weekend", amount_cents: 29700, kind: "oto", offer_id: "of1", product_id: null, stripe_subscription_id: null }],
    users: [{ id: "u1", username: "Zz Buyer" }],
  };
  s.pi = { id: "pi_1", status: "succeeded", amount_received: 29700, currency: "usd", customer: "cus_1", metadata: {} };
  s.customer = { id: "cus_1", name: null, balance: 0 };
  s.invoices = {};
  s.calls = [];
});

describe("invoiceLines", () => {
  it("keeps one line per paid item", () => {
    expect(invoiceLines({ items: [{ description: "Host", amountCents: 4700, subscription: false }, { description: "Bump", amountCents: 2900, subscription: false }], taxCents: 0, chargedCents: 7600, fallbackDescription: "Host + Bump" }))
      .toEqual([{ description: "Host", amountCents: 4700 }, { description: "Bump", amountCents: 2900 }]);
  });
  it("leaves out subscription lines and $0 lines", () => {
    expect(invoiceLines({ items: [{ description: "Plan", amountCents: 0, subscription: true }, { description: "Free", amountCents: 0, subscription: false }, { description: "Bump", amountCents: 1900, subscription: false }], taxCents: 0, chargedCents: 1900, fallbackDescription: "x" }))
      .toEqual([{ description: "Bump", amountCents: 1900 }]);
  });
  it("falls back to one line at the charge when the lines can't explain it", () => {
    expect(invoiceLines({ items: [{ description: "A", amountCents: 4000, subscription: false }], taxCents: 0, chargedCents: 3800, fallbackDescription: "A" }))
      .toEqual([{ description: "A", amountCents: 3800 }]);
  });
  it("adds tax as its own line", () => {
    expect(invoiceLines({ items: [{ description: "A", amountCents: 1000, subscription: false }], taxCents: 200, chargedCents: 1200, fallbackDescription: "A" }))
      .toEqual([{ description: "A", amountCents: 1000 }, { description: "Tax", amountCents: 200 }]);
  });
});

describe("couponMemo", () => {
  it("names the code and the amount, with a plain hyphen", () => {
    expect(couponMemo("ZZ10", 470, "usd")).toBe("Coupon ZZ10 applied: -$4.70");
  });
  it("is null with no discount", () => {
    expect(couponMemo(null, 0, "usd")).toBeNull();
    expect(couponMemo("ZZ10", 0, "usd")).toBeNull();
  });
});

describe("invoiceForOrder", () => {
  it("makes, finalizes and pays one invoice dated the purchase day, and remembers it on the payment", async () => {
    const r = await invoiceForOrder({ orderId: "o1", userId: "u1", create: true });
    expect(r).toMatchObject({ ok: true, invoiceId: "in_1" });
    expect(s.invoices.in_1).toMatchObject({
      status: "paid", customer: "cus_1", auto_advance: false, collection_method: "charge_automatically",
      effective_at: Math.floor(Date.parse(ORDER.created_at) / 1000),
      metadata: { store_created: "true", orderId: "o1" },
    });
    expect((s.pi.metadata as Row).grow_invoice_id).toBe("in_1");
  });

  it("refuses another member's order without touching Stripe", async () => {
    expect(await invoiceForOrder({ orderId: "o1", userId: "u2", create: true })).toEqual({ ok: false, reason: "not_found" });
    expect(s.calls).toEqual([]);
  });

  it("refuses an order from the other Stripe mode", async () => {
    mode.live = true;
    expect(await invoiceForOrder({ orderId: "o1", userId: "u1", create: true })).toEqual({ ok: false, reason: "not_eligible" });
    expect(created()).toBe(0);
  });

  it.each([
    ["no PaymentIntent", { stripe_payment_intent_id: null }],
    ["an invoice of its own (a renewal)", { stripe_invoice_id: "in_sub" }],
    ["no Stripe customer", { stripe_customer_id: null }],
  ])("refuses an order with %s", async (_, patch) => {
    db.tables.orders = [{ ...ORDER, ...patch }];
    expect(await invoiceForOrder({ orderId: "o1", userId: "u1", create: true })).toEqual({ ok: false, reason: "not_eligible" });
    expect(created()).toBe(0);
  });

  it("refuses a payment that took nothing", async () => {
    s.pi = { ...s.pi, amount_received: 0 };
    expect(await invoiceForOrder({ orderId: "o1", userId: "u1", create: true })).toEqual({ ok: false, reason: "not_eligible" });
    expect(created()).toBe(0);
  });

  it("refuses an app-billed order", async () => {
    db.tables.order_items = [{ order_id: "o1", description: "App renewal", amount_cents: 29700, kind: "renewal", offer_id: null, product_id: null, stripe_subscription_id: "sub_x" }];
    expect(await invoiceForOrder({ orderId: "o1", userId: "u1", create: true })).toEqual({ ok: false, reason: "not_eligible" });
    expect(created()).toBe(0);
  });

  it("only looks, never makes, when create is false", async () => {
    expect(await invoiceForOrder({ orderId: "o1", userId: "u1", create: false })).toEqual({ ok: false, reason: "view_only" });
    expect(created()).toBe(0);
    s.invoices.in_9 = { id: "in_9", status: "paid", hosted_invoice_url: "https://invoice.stripe.com/i/9", invoice_pdf: null };
    s.pi = { ...s.pi, metadata: { grow_invoice_id: "in_9" } };
    expect(await invoiceForOrder({ orderId: "o1", userId: "u1", create: false })).toMatchObject({ ok: true, invoiceId: "in_9" });
  });

  it("makes a new invoice when the remembered one was voided, and remembers the new one", async () => {
    s.invoices.in_old = { id: "in_old", status: "void" };
    s.pi = { ...s.pi, metadata: { grow_invoice_id: "in_old" } };
    const r = await invoiceForOrder({ orderId: "o1", userId: "u1", create: true });
    expect(r.ok && r.invoiceId).not.toBe("in_old");
    expect((s.pi.metadata as Row).grow_invoice_id).toBe(r.ok ? r.invoiceId : "");
  });

  it("copies the member's name onto a nameless Stripe customer, and never overwrites one", async () => {
    await invoiceForOrder({ orderId: "o1", userId: "u1", create: true });
    expect(s.calls).toContain("customers.update:Zz Buyer");

    s.calls = [];
    s.invoices = {};
    s.pi = { ...s.pi, metadata: {} };
    s.customer = { id: "cus_1", name: "WINR GmbH", balance: 0 };
    await invoiceForOrder({ orderId: "o1", userId: "u1", create: true });
    expect(s.calls.some((c) => c.startsWith("customers.update"))).toBe(false);
  });

  it("never builds on a customer's Stripe balance: their credit is not spent on money already taken", async () => {
    s.customer = { id: "cus_1", name: "Zz", balance: -500 };
    expect(await invoiceForOrder({ orderId: "o1", userId: "u1", create: true })).toEqual({ ok: false, reason: "stripe_error" });
    expect(created()).toBe(0);
    expect(recordError).toHaveBeenCalled();
  });

  it("refuses a payment that belongs to a different Stripe customer than the order", async () => {
    s.pi = { ...s.pi, customer: "cus_other" };
    expect(await invoiceForOrder({ orderId: "o1", userId: "u1", create: true })).toEqual({ ok: false, reason: "not_eligible" });
    expect(created()).toBe(0);
  });

  it("does not add lines again to a draft that already has them", async () => {
    s.invoices.in_d = { id: "in_d", status: "draft", currency: "usd", lines: { data: [{ amount: 29700 }] } };
    s.pi = { ...s.pi, metadata: { grow_invoice_id: "in_d" } };
    const r = await invoiceForOrder({ orderId: "o1", userId: "u1", create: true });
    expect(s.calls).not.toContain("invoiceItems.create");
    expect(r).toMatchObject({ ok: true, invoiceId: "in_d" });
  });

  it("voids an invoice whose total disagrees with the charge, and hands nothing out", async () => {
    s.invoices.in_d = { id: "in_d", status: "draft", currency: "usd", lines: { data: [{ amount: 29700 }, { amount: 29700 }] } };
    s.pi = { ...s.pi, metadata: { grow_invoice_id: "in_d" } };
    expect(await invoiceForOrder({ orderId: "o1", userId: "u1", create: true })).toEqual({ ok: false, reason: "stripe_error" });
    expect(s.invoices.in_d.status).toBe("void");
    expect(recordError).toHaveBeenCalled();
  });

  it("never marks paid out of band, and hands out nothing unpaid, when the attach fails", async () => {
    const { stripe } = await import("@/lib/stripe");
    const inv = stripe().invoices;
    const attach = inv.attachPayment;
    inv.attachPayment = async () => { throw new Error("timeout"); };
    try {
      expect(await invoiceForOrder({ orderId: "o1", userId: "u1", create: true })).toEqual({ ok: false, reason: "stripe_error" });
      expect(s.calls).not.toContain("invoices.pay");
    } finally {
      inv.attachPayment = attach;
    }
  });

  it("hands out nothing that is not paid, even when the attach answers", async () => {
    const { stripe } = await import("@/lib/stripe");
    const inv = stripe().invoices;
    const attach = inv.attachPayment;
    inv.attachPayment = (async (id: string) => s.invoices[id]) as unknown as typeof attach;
    try {
      expect(await invoiceForOrder({ orderId: "o1", userId: "u1", create: true })).toEqual({ ok: false, reason: "stripe_error" });
    } finally {
      inv.attachPayment = attach;
    }
  });

  it("reports a Stripe failure without throwing", async () => {
    s.pi = null as unknown as Row;
    expect(await invoiceForOrder({ orderId: "o1", userId: "u1", create: true })).toEqual({ ok: false, reason: "stripe_error" });
    expect(recordError).toHaveBeenCalled();
  });
});

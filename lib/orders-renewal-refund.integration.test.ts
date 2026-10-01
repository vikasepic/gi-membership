import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

/**
 * Refunding a RENEWAL order from the admin.
 *
 * A renewal order (lib/renewals.ts) carries the Stripe invoice and no
 * PaymentIntent, so refundOrder used to take its "$0 trial-start" branch:
 * end the subscription, revoke access, give nothing back, mark it refunded.
 * Seen 1 Oct 2026 on a Funnel App renewal, refunded by hand instead.
 *
 * Real database, Stripe stubbed: the invoice's payment is what has to be
 * found, and that is one call whose shape is the whole point.
 */

const stripeCalls = vi.hoisted(() => ({
  refunds: [] as { args: Record<string, unknown>; opts?: Record<string, unknown> }[],
  cancelled: [] as string[],
  invoicePayments: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/stripe", async (orig) => ({
  ...(await orig<typeof import("@/lib/stripe")>()),
  stripe: () => ({
    invoicePayments: {
      list: async (params: Record<string, unknown>) => {
        stripeCalls.invoicePayments.push(params);
        return params.invoice === "in_zz_refund" ? { data: [{ payment: { type: "payment_intent", payment_intent: "pi_zz_refund" } }] } : { data: [] };
      },
    },
    refunds: { create: async (args: Record<string, unknown>, opts?: Record<string, unknown>) => { stripeCalls.refunds.push({ args, opts }); return { id: "re_zz" }; } },
    subscriptions: {
      retrieve: async () => ({ schedule: null }),
      cancel: async (id: string) => { stripeCalls.cancelled.push(id); return { id, status: "canceled" }; },
    },
    subscriptionSchedules: { cancel: async () => ({}) },
  }),
}));

const { createServiceClient } = await import("@/lib/supabase/server");
const { getStoreId } = await import("@/lib/store");
const { refundOrder, orderForInvoicePayment } = await import("@/lib/orders");

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
let storeId = "";
let userId = "";
let offerId = "";

describe.skipIf(!canRun)("refunding a renewal order (integration)", () => {
  const db = () => createServiceClient();
  beforeAll(async () => {
    storeId = await getStoreId();
    const email = `zzrefund_${Date.now()}@example.com`;
    const created = await db().auth.admin.createUser({ email, password: "password12345", email_confirm: true });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    userId = created.data.user.id;
    await db().from("users").insert({ id: userId, store_id: storeId, email });
    offerId = crypto.randomUUID();
    const o = await db().from("offers").insert({
      id: offerId, store_id: storeId, key: `zz-refund-${offerId}`, name: "zz Funnel App", grant_type: "subscription",
      grant_app_id: APP, grant_entitlement_key: `zz-refund-${offerId}`, grant_channels: [], billing_type: "recurring", interval: "month",
      price_cents: 2900, currency: "usd", headline: "fixture", description: "fixture",
    });
    if (o.error) throw new Error(`fixture offer: ${o.error.message}`);
  });

  async function renewalOrder(invoice: string): Promise<string> {
    const { data: order, error } = await db().from("orders")
      .insert({ store_id: storeId, user_id: userId, email: `zzrefund@example.com`, status: "paid", total_cents: 2900, subtotal_cents: 2900, currency: "usd", stripe_invoice_id: invoice, livemode: false })
      .select("id").single();
    if (error || !order) throw new Error(`fixture order: ${error?.message}`);
    const it = await db().from("order_items").insert({ store_id: storeId, order_id: order.id, kind: "renewal", description: "1 × zz Funnel App (at $29.00 / month)", amount_cents: 2900, offer_id: offerId, stripe_subscription_id: "sub_zz_refund" });
    if (it.error) throw new Error(`fixture item: ${it.error.message}`);
    return order.id as string;
  }

  it("refunds the invoice's payment, ends the subscription and marks the order refunded", async () => {
    const orderId = await renewalOrder("in_zz_refund");
    expect(await refundOrder(orderId)).toMatchObject({ ok: true });
    expect(stripeCalls.invoicePayments).toContainEqual(expect.objectContaining({ invoice: "in_zz_refund" }));
    expect(stripeCalls.refunds).toContainEqual({ args: { payment_intent: "pi_zz_refund" }, opts: { idempotencyKey: `refund_order_${orderId}` } });
    expect(stripeCalls.cancelled).toContain("sub_zz_refund");
    const { data } = await db().from("orders").select("status").eq("id", orderId).single();
    expect(data!.status).toBe("refunded");
  });

  it("finds a renewal order from the PaymentIntent that paid its invoice", async () => {
    const orderId = await renewalOrder("in_zz_lookup");
    stripeCalls.invoicePayments.length = 0;
    // The webhook's side: it holds a PaymentIntent and has to reach the invoice.
    const found = await orderForInvoicePayment("pi_zz_lookup", async () => "in_zz_lookup");
    expect(found).toMatchObject({ id: orderId, currency: "usd" });
    expect(await orderForInvoicePayment("pi_zz_nothing", async () => null)).toBeNull();
  });
});

afterAll(async () => {
  if (!canRun || !userId) return;
  const c = createServiceClient();
  const { data: orders } = await c.from("orders").select("id").eq("user_id", userId);
  for (const o of orders ?? []) await c.from("order_items").delete().eq("order_id", o.id);
  await c.from("ownership").delete().eq("user_id", userId);
  await c.from("orders").delete().eq("user_id", userId);
  await c.from("users").delete().eq("id", userId);
  await c.auth.admin.deleteUser(userId);
  if (offerId) await c.from("offers").delete().eq("id", offerId);
});

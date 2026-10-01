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
  creditNotes: [] as { args: Record<string, unknown>; opts?: Record<string, unknown> }[],
  cancelled: [] as string[],
  invoicePayments: [] as Record<string, unknown>[],
  // What Stripe answers about the refund it made. Tests set "failed" to see
  // the order left alone.
  refundStatus: "succeeded" as string,
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
    creditNotes: {
      create: async (args: Record<string, unknown>, opts?: Record<string, unknown>) => {
        stripeCalls.creditNotes.push({ args, opts });
        return { id: "cn_zz", refunds: [{ refund: { id: "re_cn", amount: args.refund_amount, status: stripeCalls.refundStatus } }] };
      },
    },
    refunds: {
      create: async (args: Record<string, unknown>, opts?: Record<string, unknown>) => {
        stripeCalls.refunds.push({ args, opts });
        return { id: "re_pi", amount: 5000, status: stripeCalls.refundStatus };
      },
    },
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

  it("refunds through a credit note on the invoice, ends the subscription and marks the order refunded", async () => {
    // A credit note with refund_amount makes the refund AND records it on the
    // invoice in one step, so the invoice the member downloads says refunded.
    // email_type none: whether the member is emailed is the owner's call.
    const orderId = await renewalOrder("in_zz_refund");
    expect(await refundOrder(orderId)).toMatchObject({ ok: true });
    expect(stripeCalls.creditNotes).toContainEqual({
      args: { invoice: "in_zz_refund", amount: 2900, refund_amount: 2900, email_type: "none", expand: ["refunds.refund"] },
      opts: { idempotencyKey: `refund_order_${orderId}` },
    });
    expect(stripeCalls.refunds).toEqual([]);
    expect(stripeCalls.cancelled).toContain("sub_zz_refund");
    const { data } = await db().from("orders").select("status").eq("id", orderId).single();
    expect(data!.status).toBe("refunded");
  });

  it("reports the refund Stripe made: its id, amount and status", async () => {
    stripeCalls.refundStatus = "succeeded";
    const orderId = await renewalOrder("in_zz_report");
    expect(await refundOrder(orderId)).toEqual({ ok: true, refundId: "re_cn", refundedCents: 2900, refundStatus: "succeeded", currency: "usd" });
  });

  it("leaves the order paid and the access in place when Stripe says the refund failed", async () => {
    // Marking it refunded on our side alone is what kept a $398 renewal
    // "refunded" for a day with nothing given back (30 Sep 2026).
    stripeCalls.refundStatus = "failed";
    stripeCalls.cancelled.length = 0;
    const orderId = await renewalOrder("in_zz_failed");
    const res = await refundOrder(orderId);
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/failed/i);
    expect(stripeCalls.cancelled).toEqual([]);
    const { data } = await db().from("orders").select("status").eq("id", orderId).single();
    expect(data!.status).toBe("paid");
    stripeCalls.refundStatus = "succeeded";
  });

  it("a checkout order reports its refund too", async () => {
    stripeCalls.refundStatus = "succeeded";
    const { data: order } = await db().from("orders")
      .insert({ store_id: storeId, user_id: userId, email: "zzrefund@example.com", status: "paid", total_cents: 5000, subtotal_cents: 5000, currency: "usd", stripe_payment_intent_id: `pi_zz_${Date.now()}`, livemode: false })
      .select("id").single();
    expect(await refundOrder(order!.id as string)).toEqual({ ok: true, refundId: "re_pi", refundedCents: 5000, refundStatus: "succeeded", currency: "usd" });
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

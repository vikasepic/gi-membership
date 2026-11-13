import { describe, it, expect, afterAll } from "vitest";
import type Stripe from "stripe";
import { startOfferCheckout, completeOfferCheckout } from "@/lib/offer-checkout";
import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { STORE_TAG } from "@/lib/coupons";
import { recordRenewal } from "@/lib/renewals";
import { orderForPaymentIntent } from "@/lib/orders";
import { purchaseDocsForUser, subscriptionInvoicesForUser } from "@/lib/receipts";
import { invoiceForOrder } from "@/lib/order-invoice";

/**
 * The five scenarios the owner asked for before any invoice code was written
 * (13 Nov 2026), each a real test-mode purchase through the real checkout in
 * one of the shapes the live orders actually take.
 * Spec: docs/superpowers/specs/2026-11-13-stripe-invoice-per-purchase-design.md.
 */
const canRun =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const made: string[] = [];
const users: string[] = [];

async function offerOf(cents: number, extra: Record<string, unknown> = {}) {
  const db = createServiceClient();
  const id = crypto.randomUUID();
  made.push(id);
  const { error } = await db.from("offers").insert({
    id, store_id: await getStoreId(), key: `zz-inv-${Date.now()}-${id}`, name: `zz invoice fixture ${cents}`,
    grant_type: "subscription", grant_app_id: APP, grant_entitlement_key: "content-engine", grant_channels: [],
    billing_type: "one_time", price_cents: cents, currency: "usd", headline: "fixture", description: "fixture",
    active: true, ...extra,
  });
  if (error) throw new Error(`fixture: ${error.message}`);
  const { error: priceErr } = await db.from("offer_prices").insert({
    offer_id: id,
    billing_type: (extra.billing_type as string | undefined) ?? "one_time",
    interval: (extra.interval as string | undefined) ?? null,
    interval_count: 1,
    trial_days: (extra.trial_days as number | null | undefined) ?? null,
    price_cents: cents,
    sort_order: 0,
  });
  if (priceErr) throw new Error(`fixture price: ${priceErr.message}`);
  return id;
}

async function member(name: string) {
  const db = createServiceClient();
  const email = `zz_inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.test`;
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  const userId = created.data.user!.id;
  users.push(userId);
  await db.from("users").insert({ id: userId, store_id: await getStoreId(), email, username: name });
  return { userId, email };
}

/** Buy an offer the way the page does; returns the order and its PaymentIntent (when it had one). */
async function buy(userId: string, email: string, offerId: string, opts: { bumpChoice?: 0; couponCode?: string } = {}) {
  const start = await startOfferCheckout({ userId, email, offerId, ...opts });
  if (!start.ok) throw new Error(`checkout refused: ${JSON.stringify(start)}`);
  const intentId = start.clientSecret.split("_secret_")[0];
  if (intentId.startsWith("pi_")) {
    await stripe().paymentIntents.confirm(intentId, { payment_method: "pm_card_visa", return_url: "http://localhost:3000/checkout/offer/complete" });
  } else {
    await stripe().setupIntents.confirm(intentId, { payment_method: "pm_card_visa", return_url: "http://localhost:3000/checkout/offer/complete" });
  }
  const done = await completeOfferCheckout(intentId);
  if (!done.ok) throw new Error(`completion refused: ${JSON.stringify(done)}`);
  const { data: order } = await createServiceClient()
    .from("orders")
    .select("id, created_at, total_cents, stripe_customer_id, stripe_payment_intent_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(1)
    .single();
  return order as { id: string; created_at: string; total_cents: number; stripe_customer_id: string; stripe_payment_intent_id: string | null };
}

async function ourInvoices(customer: string, orderId: string) {
  const all = await stripe().invoices.list({ customer, limit: 20 });
  return all.data.filter((i) => i.metadata?.orderId === orderId);
}

async function orderCount(userId: string) {
  const { count } = await createServiceClient().from("orders").select("id", { count: "exact", head: true }).eq("user_id", userId);
  return count ?? 0;
}

function okId(r: Awaited<ReturnType<typeof invoiceForOrder>>): string {
  if (!r.ok) throw new Error(`invoiceForOrder refused: ${r.reason}`);
  return r.invoiceId;
}

describe.skipIf(!canRun)("1. one offer, one payment", () => {
  it("makes one paid invoice dated the purchase day, one line at the charge, and every repeat finds it", async () => {
    const { userId, email } = await member("Zz Single Buyer");
    const order = await buy(userId, email, await offerOf(29700));
    const piId = order.stripe_payment_intent_id!;
    const ordersBefore = await orderCount(userId);

    const id = okId(await invoiceForOrder({ orderId: order.id, userId, create: true }));
    const inv = await stripe().invoices.retrieve(id, { expand: ["lines"] });
    expect(inv.status).toBe("paid");
    expect(inv.amount_paid).toBe(29700);
    expect(inv.lines.data.map((l) => l.amount)).toEqual([29700]);
    expect(inv.effective_at).toBe(Math.floor(Date.parse(order.created_at) / 1000));
    expect(inv.metadata).toMatchObject({ store_created: "true", orderId: order.id });
    expect(inv.customer_name).toBe("Zz Single Buyer");
    expect((await stripe().paymentIntents.retrieve(piId)).metadata.grow_invoice_id).toBe(id);

    // A second call, and two at once, land on the same invoice.
    const args = { orderId: order.id, userId, create: true };
    const [a, b] = await Promise.all([invoiceForOrder(args), invoiceForOrder(args)]);
    const c = await invoiceForOrder(args);
    expect(new Set([okId(a), okId(b), okId(c)])).toEqual(new Set([id]));
    expect(await ourInvoices(order.stripe_customer_id, order.id)).toHaveLength(1);

    // Nothing else moves: no order, not a renewal, not a subscription invoice.
    expect(await orderCount(userId)).toBe(ordersBefore);
    expect(await recordRenewal(inv as Stripe.Invoice, { receipt: false, track: false })).toMatchObject({ recorded: false });
    expect((await subscriptionInvoicesForUser(userId)).map((i) => i.id)).not.toContain(id);
  });
});

describe.skipIf(!canRun)("2. product, bump and coupon in one payment", () => {
  it("one line per item, the coupon in the memo, total equal to the charge", async () => {
    const coupon = await stripe().coupons.create({ amount_off: 1000, currency: "usd", duration: "once", metadata: { store: STORE_TAG } });
    const code = `ZZINV${Date.now()}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
    await stripe().promotionCodes.create({ promotion: { type: "coupon", coupon: coupon.id }, code });
    const bumpId = await offerOf(2900);
    const hostId = await offerOf(4700, { bump_offer_id: bumpId });
    const { userId, email } = await member("Zz Bump Buyer");
    const order = await buy(userId, email, hostId, { bumpChoice: 0, couponCode: code });
    const pi = await stripe().paymentIntents.retrieve(order.stripe_payment_intent_id!);

    const inv = await stripe().invoices.retrieve(okId(await invoiceForOrder({ orderId: order.id, userId, create: true })), { expand: ["lines"] });
    expect(inv.lines.data).toHaveLength(2);
    expect(inv.total).toBe(pi.amount_received);
    expect(inv.amount_paid).toBe(pi.amount_received);
    expect(inv.description).toContain(code);
  });
});

describe.skipIf(!canRun)("3. one-off and a subscription in one checkout", () => {
  it("invoices the one-off payment only", async () => {
    const bumpId = await offerOf(2900, { billing_type: "recurring", interval: "month", trial_days: null, name: "zz recurring bump" });
    const hostId = await offerOf(4700, { bump_offer_id: bumpId });
    const { userId, email } = await member("Zz Mixed Buyer");
    const order = await buy(userId, email, hostId, { bumpChoice: 0 });
    const pi = await stripe().paymentIntents.retrieve(order.stripe_payment_intent_id!);
    expect(pi.amount_received).toBe(4700);

    const inv = await stripe().invoices.retrieve(okId(await invoiceForOrder({ orderId: order.id, userId, create: true })), { expand: ["lines"] });
    expect(inv.total).toBe(4700);
    expect(inv.lines.data.some((l) => (l.description ?? "").includes("zz recurring bump"))).toBe(false);
  });
});

describe.skipIf(!canRun)("4. subscriptions", () => {
  it("creates nothing for a paid first charge or a $0 trial, and shows Stripe's own invoice", async () => {
    // Two members: one person can't hold two subscriptions to the same app.
    const a = await member("Zz Sub Buyer");
    const b = await member("Zz Trial Buyer");
    const paid = await buy(a.userId, a.email, await offerOf(2900, { billing_type: "recurring", interval: "month", trial_days: null }));
    const trial = await buy(b.userId, b.email, await offerOf(3900, { billing_type: "recurring", interval: "month", trial_days: 7 }));
    const count = async (customer: string) => (await stripe().invoices.list({ customer, limit: 20 })).data.length;
    const before = [await count(paid.stripe_customer_id), await count(trial.stripe_customer_id)];

    expect((await purchaseDocsForUser(a.userId)).find((d) => d.orderId === paid.id)).toMatchObject({
      invoiceUrl: expect.stringContaining("stripe.com"),
      receiptUrl: expect.stringContaining("stripe.com"),
      canMakeInvoice: false,
    });
    expect((await purchaseDocsForUser(b.userId)).find((d) => d.orderId === trial.id)).toMatchObject({
      invoiceUrl: null, receiptUrl: null, canMakeInvoice: false,
    });

    expect((await invoiceForOrder({ orderId: paid.id, userId: a.userId, create: true })).ok).toBe(false);
    expect((await invoiceForOrder({ orderId: trial.id, userId: b.userId, create: true })).ok).toBe(false);
    expect([await count(paid.stripe_customer_id), await count(trial.stripe_customer_id)]).toEqual(before);
  });
});

describe.skipIf(!canRun)("5. refunds", () => {
  it("a fully refunded one-off still gets its invoice for what was paid", async () => {
    const { userId, email } = await member("Zz Refunded Buyer");
    const order = await buy(userId, email, await offerOf(19700));
    await stripe().refunds.create({ payment_intent: order.stripe_payment_intent_id! });

    const inv = await stripe().invoices.retrieve(okId(await invoiceForOrder({ orderId: order.id, userId, create: true })));
    expect(inv.status).toBe("paid");
    expect(inv.amount_paid).toBe(19700);
  });

  it("a refund after the invoice leaves the invoice as made and the order found by its PaymentIntent", async () => {
    const { userId, email } = await member("Zz Later Refund");
    const order = await buy(userId, email, await offerOf(19700));
    const id = okId(await invoiceForOrder({ orderId: order.id, userId, create: true }));
    await stripe().refunds.create({ payment_intent: order.stripe_payment_intent_id!, amount: 1000 });

    expect((await orderForPaymentIntent(order.stripe_payment_intent_id!))?.id).toBe(order.id);
    const inv = await stripe().invoices.retrieve(id);
    expect(inv.status).toBe("paid");
    expect(inv.amount_paid).toBe(19700);
  });
});

describe.skipIf(!canRun)("6. a customer with a Stripe balance (final review, 13 Nov)", () => {
  it("makes no invoice and leaves the customer's credit untouched", async () => {
    const { userId, email } = await member("Zz Credit Buyer");
    const order = await buy(userId, email, await offerOf(19700));
    await stripe().customers.update(order.stripe_customer_id, { balance: -500 });

    expect(await invoiceForOrder({ orderId: order.id, userId, create: true })).toEqual({ ok: false, reason: "stripe_error" });
    expect(((await stripe().customers.retrieve(order.stripe_customer_id)) as Stripe.Customer).balance).toBe(-500);
    expect(await ourInvoices(order.stripe_customer_id, order.id)).toHaveLength(0);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of users) {
    const { data: orders } = await db.from("orders").select("id").eq("user_id", id);
    for (const o of orders ?? []) await db.from("order_items").delete().eq("order_id", o.id as string);
    await db.from("orders").delete().eq("user_id", id);
    await db.from("ownership").delete().eq("user_id", id);
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
  for (const id of made) await db.from("offers").update({ bump_offer_id: null }).eq("id", id);
  for (const id of made) await db.from("offers").delete().eq("id", id);
}, 60_000);

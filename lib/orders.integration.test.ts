import { describe, it, expect, afterAll } from "vitest";
import { listOrders, refundOrder } from "@/lib/orders";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const createdUserIds: string[] = [];
const createdOrderIds: string[] = [];

async function member() {
  const db = createServiceClient();
  const email = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  const id = created.data.user.id;
  createdUserIds.push(id);
  await db.from("users").insert({ id, store_id: await getStoreId(), email, username: "ord" });
  return { id, email };
}

// A $0 order — what a trial start books. It charges nothing, so there is no
// PaymentIntent to refund, but it DID grant access, so refunding must still
// take that access away.
async function zeroOrderWithAccess() {
  const db = createServiceClient();
  const storeId = await getStoreId();
  const { id: userId, email } = await member();
  const { data: order } = await db
    .from("orders")
    .insert({
      store_id: storeId, user_id: userId, email, status: "paid",
      currency: "usd", subtotal_cents: 0, total_cents: 0,
    })
    .select("id").single();
  createdOrderIds.push(order!.id as string);

  const { data: product } = await db.from("products").select("id").limit(1).single();
  await db.from("order_items").insert({
    store_id: storeId, order_id: order!.id, kind: "product",
    product_id: product!.id, description: "Test item", amount_cents: 0,
  });
  await db.from("ownership").insert({
    store_id: storeId, user_id: userId, product_id: product!.id,
    source: "purchase", status: "active",
  });
  return { orderId: order!.id as string, userId, productId: product!.id as string };
}

describe.skipIf(!canRun)("admin orders + refund (integration)", () => {
  it("lists orders newest first with their line items", async () => {
    const { orderId } = await zeroOrderWithAccess();
    const orders = await listOrders();
    const mine = orders.find((o) => o.id === orderId);
    expect(mine).toBeTruthy();
    expect(mine!.items.map((i) => i.description)).toContain("Test item");
    // Newest first.
    const times = orders.map((o) => new Date(o.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("refunding a $0 order still removes access, despite there being no charge", async () => {
    const db = createServiceClient();
    const { orderId, userId, productId } = await zeroOrderWithAccess();

    const res = await refundOrder(orderId);
    expect(res.ok).toBe(true);

    const { data: own } = await db
      .from("ownership").select("id").eq("user_id", userId).eq("product_id", productId);
    expect(own).toHaveLength(0); // product ownership is deleted outright
    const { data: after } = await db.from("orders").select("status").eq("id", orderId).single();
    expect(after!.status).toBe("refunded");
  });

  it("refunding twice is safe and reports the second as already refunded", async () => {
    const { orderId } = await zeroOrderWithAccess();
    expect(await refundOrder(orderId)).toMatchObject({ ok: true });
    expect(await refundOrder(orderId)).toMatchObject({ ok: true, alreadyRefunded: true });
  });

  it("refuses to refund an order that was never paid", async () => {
    const db = createServiceClient();
    const { id: userId, email } = await member();
    const { data: order } = await db
      .from("orders")
      .insert({
        store_id: await getStoreId(), user_id: userId, email, status: "pending",
        currency: "usd", subtotal_cents: 2700, total_cents: 2700,
      })
      .select("id").single();
    createdOrderIds.push(order!.id as string);
    expect(await refundOrder(order!.id as string)).toMatchObject({ ok: false });
  });
});

afterAll(async () => {
  const db = createServiceClient();
  for (const id of createdOrderIds) await db.from("order_items").delete().eq("order_id", id);
  for (const id of createdOrderIds) await db.from("orders").delete().eq("id", id);
  for (const id of createdUserIds) {
    await db.from("ownership").delete().eq("user_id", id);
    await db.from("orders").delete().eq("user_id", id);
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
});

// --- a real Stripe charge, refunded for real (test mode) -------------------
import { createCheckoutIntent, finalizeOrder } from "@/lib/checkout";
import { stripe } from "@/lib/stripe";

const canRunStripe =
  !!process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!canRunStripe)("refunding a genuinely charged order (integration)", () => {
  it("issues the Stripe refund, revokes access, and is safe to repeat", async () => {
    const email = `refund_${Date.now()}@example.com`;
    const res = await createCheckoutIntent({
      productSlug: "placeholder-offer",
      email,
      fullName: "Test Buyer",
      bumpChoice: "none",
      country: "US",
    });
    if (!res.ok) throw new Error(`checkout failed: ${res.error}`);
    const piId = res.clientSecret.split("_secret_")[0];
    await stripe().paymentIntents.confirm(piId, {
      payment_method: "pm_card_visa",
      return_url: "http://localhost:3000/checkout/complete",
    });
    await finalizeOrder(piId);

    const db = createServiceClient();
    const { data: user } = await db.from("users").select("id").eq("email", email).single();
    createdUserIds.push(user!.id as string);
    const { data: order } = await db
      .from("orders").select("id").eq("stripe_payment_intent_id", piId).single();
    const orderId = order!.id as string;

    // They own what they bought before the refund.
    const before = await db.from("ownership").select("id").eq("user_id", user!.id);
    expect((before.data ?? []).length).toBeGreaterThan(0);

    expect(await refundOrder(orderId)).toMatchObject({ ok: true });

    // Stripe really refunded it — not just our own records.
    const refunds = await stripe().refunds.list({ payment_intent: piId, limit: 10 });
    expect(refunds.data.length).toBe(1);
    expect(refunds.data[0].status).toBe("succeeded");

    const after = await db.from("ownership").select("id").eq("user_id", user!.id);
    expect(after.data ?? []).toHaveLength(0);
    const { data: o } = await db.from("orders").select("status").eq("id", orderId).single();
    expect(o!.status).toBe("refunded");

    // Repeating must not create a second refund in Stripe.
    expect(await refundOrder(orderId)).toMatchObject({ ok: true, alreadyRefunded: true });
    const again = await stripe().refunds.list({ payment_intent: piId, limit: 10 });
    expect(again.data.length).toBe(1);
  });
});

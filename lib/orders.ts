import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { stripe } from "@/lib/stripe";
import { revokeOwnershipForOrder } from "@/lib/subscription-sync";

// Admin-side order reads and refunds. Service-role; callers are admin actions.

export type OrderItemRow = {
  kind: "product" | "bump" | "oto";
  description: string;
  amountCents: number;
  stripeSubscriptionId: string | null;
};

export type OrderRow = {
  id: string;
  email: string;
  status: "pending" | "paid" | "failed" | "refunded";
  currency: string;
  totalCents: number;
  taxCents: number | null;
  buyerCountry: string | null;
  stripePaymentIntentId: string | null;
  /**
   * False for an order made against a Stripe test key.
   *
   * A test purchase is otherwise a real paid row nobody can tell from a real
   * one — which is how two of them ended up counting towards revenue and
   * holding subscription ids Stripe will never renew.
   */
  livemode: boolean;
  createdAt: string;
  items: OrderItemRow[];
};

// Newest first. Items are fetched in one batched query rather than per order.
export async function listOrders(limit = 100): Promise<OrderRow[]> {
  const db = createServiceClient();
  const storeId = await getStoreId();

  const { data: orders, error } = await db
    .from("orders")
    .select(
      "id, email, status, currency, total_cents, tax_cents, buyer_country, stripe_payment_intent_id, livemode, created_at",
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listOrders: ${error.message}`);
  if (!orders || orders.length === 0) return [];

  const { data: items, error: itemsErr } = await db
    .from("order_items")
    .select("order_id, kind, description, amount_cents, stripe_subscription_id")
    .in("order_id", orders.map((o) => o.id as string));
  if (itemsErr) throw new Error(`listOrders items: ${itemsErr.message}`);

  const byOrder = new Map<string, OrderItemRow[]>();
  for (const i of items ?? []) {
    const key = i.order_id as string;
    byOrder.set(key, [
      ...(byOrder.get(key) ?? []),
      {
        kind: i.kind as OrderItemRow["kind"],
        description: i.description as string,
        amountCents: i.amount_cents as number,
        stripeSubscriptionId: (i.stripe_subscription_id as string) ?? null,
      },
    ]);
  }

  return orders.map((o) => ({
    id: o.id as string,
    email: o.email as string,
    status: o.status as OrderRow["status"],
    currency: o.currency as string,
    totalCents: o.total_cents as number,
    taxCents: (o.tax_cents as number) ?? null,
    buyerCountry: (o.buyer_country as string) ?? null,
    stripePaymentIntentId: (o.stripe_payment_intent_id as string) ?? null,
    livemode: (o.livemode as boolean) !== false,
    createdAt: o.created_at as string,
    items: byOrder.get(o.id as string) ?? [],
  }));
}

export type RefundResult = { ok: true; alreadyRefunded?: boolean } | { ok: false; error: string };

// Refund a paid order and take back what it granted.
//
// Deliberately idempotent at three layers, because this is real money and the
// admin can double-click:
//   1. An order already marked refunded returns early.
//   2. The Stripe call carries an idempotency key derived from the order, so a
//      concurrent second attempt cannot create a second refund.
//   3. Revocation is applied here AND by the charge.refunded webhook; both call
//      the same revokeOwnershipForPaymentIntent, which tolerates re-running.
//
// Revocation is not left to the webhook alone: if the webhook is misconfigured
// or fails, the customer would keep everything they were just refunded for.
export async function refundOrder(orderId: string): Promise<RefundResult> {
  const db = createServiceClient();
  const { data: order, error } = await db
    .from("orders")
    .select("id, status, stripe_payment_intent_id, total_cents")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status === "refunded") return { ok: true, alreadyRefunded: true };
  if (order.status !== "paid") {
    return { ok: false, error: "Only a paid order can be refunded." };
  }

  const piId = order.stripe_payment_intent_id as string | null;
  if (!piId) {
    // A $0 trial-start order books no PaymentIntent. Nothing was charged, so
    // there is nothing to give back — but access must still be withdrawn, so
    // revoke by order id rather than by a PaymentIntent that doesn't exist.
    await revokeOwnershipForOrder(orderId);
    return { ok: true };
  }

  try {
    await stripe().refunds.create(
      { payment_intent: piId },
      { idempotencyKey: `refund_order_${orderId}` },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Refund failed";
    // Stripe refuses a second refund on a fully-refunded charge. That is the
    // outcome we wanted, so reconcile our records rather than reporting failure.
    if (/already been refunded|has already been refunded/i.test(message)) {
      await revokeOwnershipForOrder(orderId);
      return { ok: true, alreadyRefunded: true };
    }
    return { ok: false, error: message };
  }

  // revokeOwnershipForOrder also flips the order to refunded.
  await revokeOwnershipForOrder(orderId);
  return { ok: true };
}

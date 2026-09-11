import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { stripe } from "@/lib/stripe";
import { revokeOwnershipForOrder } from "@/lib/subscription-sync";
import type { Labels } from "@/lib/attribution";

// Admin-side order reads and refunds. Service-role; callers are admin actions.

export type OrderItemRow = {
  kind: "product" | "bump" | "oto";
  description: string;
  amountCents: number;
  stripeSubscriptionId: string | null;
  /** The offer this line sold, when it sold one. */
  offerId?: string | null;
};

export type OrderRow = {
  id: string;
  email: string;
  /** users.username, which the checkout fills with the typed full name. Null when unknown. */
  buyerName: string | null;
  status: "pending" | "paid" | "failed" | "refunded";
  currency: string;
  totalCents: number;
  taxCents: number | null;
  buyerCountry: string | null;
  stripePaymentIntentId: string | null;
  /**
   * The offer this order was opened for, when it came from an offer checkout.
   *
   * An offer sold on its own page writes its line with `kind: "oto"` — the
   * same kind an accepted upsell uses — so the line alone cannot say which it
   * was, and the admin labelled a standalone app purchase "OTO". This is what
   * tells them apart. Null for a product order and for anything bought before
   * the column existed (migration 0077).
   */
  hostOfferId?: string | null;
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
  /** Campaign labels, migration 0079. Empty objects when none — the admin reads that as direct. */
  utmFirst: Labels;
  utmLast: Labels;
  referrer: string | null;
  /** The visit this order was placed in, migration 0080. Null for orders predating visit tracking. */
  visitId: string | null;
};

// Newest first. Items are fetched in one batched query rather than per order.
export async function listOrders(limit = 100): Promise<OrderRow[]> {
  const db = createServiceClient();
  const storeId = await getStoreId();

  const { data: orders, error } = await db
    .from("orders")
    .select(
      "id, email, status, currency, total_cents, tax_cents, buyer_country, stripe_payment_intent_id, host_offer_id, livemode, created_at, utm_first, utm_last, referrer, visit_id, users(username)",
    )
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listOrders: ${error.message}`);
  if (!orders || orders.length === 0) return [];

  const { data: items, error: itemsErr } = await db
    .from("order_items")
    .select("order_id, kind, description, amount_cents, stripe_subscription_id, offer_id")
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
        offerId: (i.offer_id as string) ?? null,
      },
    ]);
  }

  return orders.map((o) => {
    // `orders.user_id` references `users(id)`, so PostgREST embeds the buyer
    // as `users` — an object on this PostgREST version, but some versions
    // return a one-element array for a to-one embed, so handle both.
    const u = Array.isArray(o.users) ? o.users[0] : o.users;
    return {
      id: o.id as string,
      email: o.email as string,
      buyerName: ((u as { username?: string | null } | null)?.username as string | null) ?? null,
      status: o.status as OrderRow["status"],
      currency: o.currency as string,
      totalCents: o.total_cents as number,
      taxCents: (o.tax_cents as number) ?? null,
      buyerCountry: (o.buyer_country as string) ?? null,
      hostOfferId: (o.host_offer_id as string) ?? null,
      stripePaymentIntentId: (o.stripe_payment_intent_id as string) ?? null,
      livemode: (o.livemode as boolean) !== false,
      createdAt: o.created_at as string,
      items: byOrder.get(o.id as string) ?? [],
      utmFirst: (o.utm_first as Labels | null) ?? {},
      utmLast: (o.utm_last as Labels | null) ?? {},
      referrer: (o.referrer as string | null) ?? null,
      visitId: (o.visit_id as string | null) ?? null,
    };
  });
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

/** The order a Stripe charge belongs to, for a webhook that has only the intent. */
export async function orderForPaymentIntent(
  paymentIntentId: string,
): Promise<{ id: string; currency: string } | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("orders")
    .select("id, currency")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  return data ? { id: data.id as string, currency: (data.currency as string) ?? "usd" } : null;
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

// Subscription lifecycle -> ownership state. This is what keeps a cancelled or
// refunded customer from retaining app access, and what stops a single failed
// renewal from cutting off someone whose card merely expired.

export type OwnershipStatus = "active" | "trialing" | "canceled" | "past_due";

// Stripe subscription.status -> our ownership.status.
// Anything unrecognised degrades to past_due: we would rather flag an account
// for dunning than silently grant access on a status we do not understand.
export function mapSubscriptionStatus(stripeStatus: string): OwnershipStatus {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "past_due":
    case "unpaid":
    case "incomplete": // off-session 3DS pending — not paid yet
      return "past_due";
    default:
      return "past_due";
  }
}

// past_due still has access: Stripe retries a failed renewal for days, and
// revoking on the first failure punishes a recoverable card problem.
export function hasAccess(status: OwnershipStatus): boolean {
  return status !== "canceled";
}

// Apply a subscription's current state to the ownership row that tracks it.
export async function syncSubscriptionOwnership(
  stripeSubscriptionId: string,
  stripeStatus: string,
): Promise<void> {
  const db = createServiceClient();
  const status = mapSubscriptionStatus(stripeStatus);
  const { error } = await db
    .from("ownership")
    .update({ status })
    .eq("stripe_subscription_id", stripeSubscriptionId);
  if (error) throw new Error(`syncSubscriptionOwnership: ${error.message}`);
}

// A refunded order loses what it bought. Scoped to the refunded PaymentIntent's
// order so a refund of the $27 does not revoke a separately-paid subscription.
export async function revokeOwnershipForPaymentIntent(
  paymentIntentId: string,
): Promise<{ revoked: number }> {
  const db = createServiceClient();

  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, user_id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (orderErr) throw new Error(`revokeOwnership order: ${orderErr.message}`);
  if (!order?.user_id) return { revoked: 0 };

  await db.from("orders").update({ status: "refunded" }).eq("id", order.id);

  // Only the items bought on THIS order.
  const { data: items, error: itemsErr } = await db
    .from("order_items")
    .select("product_id, offer_id")
    .eq("order_id", order.id);
  if (itemsErr) throw new Error(`revokeOwnership items: ${itemsErr.message}`);

  const productIds = (items ?? []).map((i) => i.product_id).filter(Boolean) as string[];
  const offerIds = (items ?? []).map((i) => i.offer_id).filter(Boolean) as string[];

  let revoked = 0;
  if (productIds.length > 0) {
    const { data } = await db
      .from("ownership")
      .delete()
      .eq("user_id", order.user_id)
      .in("product_id", productIds)
      .select("id");
    revoked += data?.length ?? 0;
  }
  if (offerIds.length > 0) {
    const { data } = await db
      .from("ownership")
      .update({ status: "canceled" })
      .eq("user_id", order.user_id)
      .in("offer_id", offerIds)
      .select("id");
    revoked += data?.length ?? 0;
  }
  return { revoked };
}

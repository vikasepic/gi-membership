import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { pushOwnershipStateToApps } from "@/lib/app-sync";
import { sendCrmEvent } from "@/lib/crm";
import { tagLifecycle, untagRevoked } from "@/lib/ac-tags";

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

// Apply a subscription's current state to the ownership row that tracks it,
// then tell the connected app. Without that second step a cancellation updated
// our records and left the app still serving the customer.
export async function syncSubscriptionOwnership(
  stripeSubscriptionId: string,
  stripeStatus: string,
): Promise<void> {
  const db = createServiceClient();
  const status = mapSubscriptionStatus(stripeStatus);

  // Read the current state before writing, so the CRM can be told about real
  // transitions only. Stripe sends customer.subscription.updated for far more
  // than status changes — a renewal, a card update, a metadata edit — and
  // tagging on every one of those would fire the same "went active" event at
  // the CRM every month for the life of the subscription.
  const { data: before } = await db
    .from("ownership")
    .select("id, user_id, status")
    .eq("stripe_subscription_id", stripeSubscriptionId);
  const changed = (before ?? []).filter((r) => r.status !== status);

  const { data, error } = await db
    .from("ownership")
    .update({ status })
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .select("id");
  if (error) throw new Error(`syncSubscriptionOwnership: ${error.message}`);

  // Unchanged from before: apps are told on every sync, not only on change, so
  // an app that missed an earlier push still converges.
  await pushOwnershipStateToApps((data ?? []).map((r) => r.id as string));

  if (changed.length === 0) return;

  // Move the lifecycle tags to match. This is where a trial becoming a sale is
  // recorded: `active` adds the buyer tag and takes the trial tag away, and a
  // cancellation adds the cancelled tag while LEAVING the trial tag, which is
  // the only record that someone tried this and never paid.
  try {
    const { data: rows } = await db
      .from("ownership")
      .select("offer_id")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .not("offer_id", "is", null);
    const offerIds = (rows ?? []).map((r) => r.offer_id as string);
    for (const row of changed) {
      await tagLifecycle({ userId: row.user_id as string, offerIds, status });
    }
  } catch (e) {
    console.error("[syncSubscriptionOwnership] lifecycle tags failed:", e);
  }

  const crmType =
    status === "canceled"
      ? "subscription_canceled"
      : status === "past_due"
        ? "subscription_past_due"
        : status === "trialing"
          ? "trial_started"
          : "subscription_active";
  for (const row of changed) {
    const { data: user } = await db
      .from("users")
      .select("email")
      .eq("id", row.user_id as string)
      .maybeSingle();
    if (!user?.email) continue;
    await sendCrmEvent({
      type: crmType,
      email: user.email as string,
      occurredAt: Math.floor(Date.now() / 1000),
      stripeSubscriptionId,
    });
  }
}

// A refunded order loses what it bought. Scoped to the refunded PaymentIntent's
// order so a refund of the $27 does not revoke a separately-paid subscription.
export async function revokeOwnershipForPaymentIntent(
  paymentIntentId: string,
): Promise<{ revoked: number }> {
  const db = createServiceClient();
  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (orderErr) throw new Error(`revokeOwnership order: ${orderErr.message}`);
  if (!order) return { revoked: 0 };
  return revokeOwnershipForOrder(order.id as string);
}

// Same revocation keyed on the order itself. An order that charged nothing — a
// $0 trial start books no PaymentIntent — still granted access, so it still has
// to be revocable.
export async function revokeOwnershipForOrder(
  orderId: string,
): Promise<{ revoked: number }> {
  const db = createServiceClient();

  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, user_id")
    .eq("id", orderId)
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
    // A refund must reach the app too, or the customer keeps the access they
    // were just refunded for.
    await pushOwnershipStateToApps((data ?? []).map((r) => r.id as string));
  }

  // Tell the CRM too, so a refunded buyer can be untagged. Without this they
  // stay tagged as a customer forever and keep receiving the onboarding
  // sequence for something they no longer own.
  if (revoked > 0) {
    const { data: user } = await db
      .from("users")
      .select("email")
      .eq("id", order.user_id as string)
      .maybeSingle();
    if (user?.email) {
      await sendCrmEvent({
        type: "refunded",
        email: user.email as string,
        occurredAt: Math.floor(Date.now() / 1000),
        orderId: order.id as string,
      });
    }
    // Take back exactly the tags this order applied. Guarded: the refund itself
    // has already gone through, and a CRM outage must not make it look failed.
    //
    // A refund is access ending, so the offers go through the same lifecycle as
    // a cancellation — cancelled tag on, access tag off, trial tag left alone.
    // Products have no lifecycle beyond owning them, so they stay with untag.
    try {
      await untagRevoked({ userId: order.user_id as string, productIds });
      if (offerIds.length > 0) {
        await tagLifecycle({ userId: order.user_id as string, offerIds, status: "canceled" });
      }
    } catch (e) {
      console.error("[revokeOwnershipForOrder] untag failed (refund still stands):", e);
    }
  }
  return { revoked };
}

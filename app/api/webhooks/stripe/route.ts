import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { finalizeOrder } from "@/lib/checkout";
import {
  syncSubscriptionOwnership,
  revokeOwnershipForPaymentIntent,
} from "@/lib/subscription-sync";

// Stripe webhook — the authoritative order finalizer and subscription-state
// owner. Calls the SAME idempotent finalizeOrder as the thank-you page, so the
// two never diverge. The signing secret comes from `stripe listen` (dev) or the
// Dashboard endpoint (prod).
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  if (!secret || !sig) return new Response("Webhook not configured", { status: 400 });

  const body = await req.text(); // raw body required for signature verification
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "invalid signature";
    return new Response(`Webhook signature failed: ${msg}`, { status: 400 });
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await finalizeOrder(pi.id);
      break;
    }

    // Subscription lifecycle: trial -> active at day 7, dunning on a failed
    // renewal, cancellation. Store-created subs are tagged store_created in
    // metadata; we only own those (the connected app owns its own).
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
      await syncSubscriptionOwnership(sub.id, status);
      break;
    }

    // Failed renewal (expired/declined card) and off-session 3DS at the day-7
    // conversion. Both flag the account for dunning without revoking access —
    // Stripe keeps retrying, and the subscription.updated event that follows
    // carries the authoritative status.
    case "invoice.payment_failed":
    case "invoice.payment_action_required": {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | null };
      const subId =
        typeof invoice.subscription === "string" ? invoice.subscription : undefined;
      if (subId) await syncSubscriptionOwnership(subId, "past_due");
      break;
    }

    // A refund takes back what the order granted.
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const piId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (piId) await revokeOwnershipForPaymentIntent(piId);
      break;
    }

    default:
      break;
  }

  return Response.json({ received: true });
}

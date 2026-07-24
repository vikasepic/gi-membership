import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { finalizeOrder } from "@/lib/checkout";

// Stripe webhook — the authoritative order finalizer. Calls the SAME idempotent
// finalizeOrder as the thank-you page, so the two never diverge. The signing
// secret comes from `stripe listen` (dev) or the Dashboard endpoint (prod).
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
    // Subscription lifecycle (trial→active, cancels, dunning) handled in phase 6.
    default:
      break;
  }

  return Response.json({ received: true });
}

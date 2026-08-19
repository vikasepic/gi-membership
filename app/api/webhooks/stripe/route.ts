import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { recordRenewal } from "@/lib/renewals";
import { reportReversal, handleDispute, disputeWon } from "@/lib/reversals";
import { orderForPaymentIntent } from "@/lib/orders";
import { finalizeOrder } from "@/lib/checkout";
import { sendPaymentFailedEmail, sendTrialEndingEmail } from "@/lib/subscription-emails";
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
      if (subId) {
        await syncSubscriptionOwnership(subId, "past_due");
        // Access is deliberately kept while Stripe retries, so this email is
        // the only thing standing between an expired card and a customer who
        // silently disappears. Guarded: a mail failure must not 500 the
        // webhook and have Stripe redeliver a state we already applied.
        try {
          await sendPaymentFailedEmail(subId);
        } catch (e) {
          console.error("[stripe webhook] dunning email failed:", e);
        }
      }
      break;
    }

    // Three days before a trial converts. The most common reason a first
    // subscription charge is disputed is that nobody remembers signing up a
    // week ago.
    case "customer.subscription.trial_will_end": {
      try {
        await sendTrialEndingEmail(event.data.object as Stripe.Subscription);
      } catch (e) {
        console.error("[stripe webhook] trial-ending email failed:", e);
      }
      break;
    }

    // Money that arrives after the checkout: a trial converting on day 7, and
    // every renewal after it. Until this existed a subscription produced
    // exactly one order — the $0 one made at the checkout — and every real
    // charge for the life of it reached Stripe and nothing else. No order, no
    // receipt, and no conversion event, so Meta was told a trial started and
    // never told it converted.
    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const res = await recordRenewal(invoice);
      // Loud on purpose. This is the one webhook that arrives every month for
      // the life of every subscription, so a reason that turns out to be wrong
      // is a reason worth being able to grep for.
      if (!res.recorded) console.log(`[stripe webhook] invoice ${invoice.id} not recorded: ${res.reason}`);
      break;
    }

    // A refund takes back what the order granted — and says so.
    //
    // It used to only revoke. The sale stayed in Meta and GA4 as revenue for
    // good, so the reported figure drifted from the money in the bank and the
    // platforms kept optimising towards whatever produced a sale that was
    // handed straight back.
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const piId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (!piId) break;
      await revokeOwnershipForPaymentIntent(piId);

      const order = await orderForPaymentIntent(piId);
      if (order) {
        await reportReversal({
          orderId: order.id,
          // What was actually given back. A partial refund is not the whole
          // order, and reporting the order total would subtract more revenue
          // than ever left.
          amountCents: charge.amount_refunded ?? 0,
          currency: charge.currency ?? order.currency,
          kind: "Refund",
          stripeId: charge.id,
        });
      }
      break;
    }

    // The bank reversing a payment over our head.
    //
    // Nothing handled this at all: somebody disputed a charge, won by default
    // because no evidence was filed, and kept their access. The funds go the
    // moment a dispute opens, so access goes with them — and the store finds
    // out, because a dispute has a deadline and one nobody answers is lost.
    case "charge.dispute.created": {
      await handleDispute(event.data.object as Stripe.Dispute, revokeOwnershipForPaymentIntent);
      break;
    }

    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      if (dispute.status === "won") await disputeWon(dispute);
      break;
    }

    default:
      break;
  }

  return Response.json({ received: true });
}

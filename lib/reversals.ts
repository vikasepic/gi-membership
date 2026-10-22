import "server-only";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { trackServerEvent } from "@/lib/tracking";
import { eventIdFor } from "@/lib/analytics/events";
import { buyerContextFor } from "@/lib/checkout";
import { recordError } from "@/lib/errors";
import { pauseFlowsForBuyer } from "@/lib/post-purchase-stop";
import { revokeOwnershipForOrder } from "@/lib/subscription-sync";
import { stripe } from "@/lib/stripe";

/**
 * Money going back, reported.
 *
 * A refund revoked access and told nobody, so the sale stayed in Meta and GA4
 * as revenue for good. On this store more than half the paid orders have been
 * refunded, which made the reported figure unrelated to the money in the bank.
 * Worse than a wrong number: the platforms keep optimising towards whatever
 * produced a sale that was handed straight back.
 *
 * Reported as its own event rather than by trying to unsend the purchase.
 * Neither platform can retract an event, and GA4's `refund` is built for
 * exactly this — given the transaction_id the purchase carried, its reports
 * subtract it from revenue without anybody building anything.
 */
export async function reportReversal(args: {
  orderId: string;
  amountCents: number;
  currency: string;
  kind: "Refund" | "Chargeback";
  /** The Stripe object behind it — the refund, or the dispute. */
  stripeId: string;
  occurredAt?: number;
}): Promise<void> {
  try {
    const db = createServiceClient();
    const { data: order } = await db
      .from("orders")
      .select("livemode")
      .eq("id", args.orderId)
      .maybeSingle();
    if (!order) return;
    // Every reversal reports. Gating this on the stored consent flag — as it
    // did until 11 Sep 2026 — would be the worst of both: the PURCHASE of a
    // pre-change order was reported under the old rules only if consent was
    // given, but a refund of one reported under the new rules only if it was
    // too. Any order whose refund is silenced leaves Meta optimising towards
    // revenue that came back. See lib/consent.ts.
    // A test-mode order never was revenue, so taking it back is not a refund
    // anybody should hear about.
    if (order.livemode === false) return;

    const who = await buyerContextFor(args.orderId);
    if (!who) return;

    await trackServerEvent({
      ...who,
      // Keyed on the refund or dispute, not the order: an order can be
      // partially refunded more than once, and one shared id would collapse
      // three refunds into one.
      eventId: eventIdFor(args.kind, args.stripeId),
      eventName: args.kind,
      valueCents: args.amountCents,
      currency: args.currency,
      // The ORDER id, deliberately. GA4 matches a refund to its purchase on
      // transaction_id, and a refund carrying its own id is a refund of
      // nothing.
      orderId: args.orderId,
      occurredAt: args.occurredAt ?? Math.floor(Date.now() / 1000),
    });
  } catch (e) {
    // The money has already moved. Reporting may not be what fails the webhook
    // and has Stripe redeliver a reversal already applied.
    console.error("[reportReversal] failed (the reversal still stands):", e);
  }
}

/**
 * A customer's bank reversing a payment over the store's head.
 *
 * Nothing handled this at all: someone disputed a charge, won by default when
 * nobody responded, and kept their access. The funds are withdrawn the moment
 * a dispute opens, so access going with them is the honest state — and the
 * alternative, waiting for the dispute to close, means giving away the product
 * for the two to three months Stripe allows for evidence.
 *
 * It is recorded loudly rather than silently, because a dispute has a deadline
 * and a store that does not know about it cannot contest it. If it is later
 * WON, access has to be restored by hand — see disputeWon. Automating that is
 * a decision about somebody's account made from a webhook, and it is rare
 * enough to be worth a human.
 */
export async function handleDispute(
  dispute: Stripe.Dispute,
  revoke: (paymentIntentId: string) => Promise<{ revoked: number }>,
  opts?: {
    /**
     * The invoice a disputed charge belongs to. Injected so a test makes no
     * Stripe call; in production it asks Stripe.
     */
    invoiceIdFor?: (dispute: Stripe.Dispute) => Promise<string | null>;
  },
): Promise<void> {
  const piId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id;
  if (!piId) return;

  const db = createServiceClient();
  let { data: order } = await db
    .from("orders")
    .select("id, email, currency, store_id")
    .eq("stripe_payment_intent_id", piId)
    .maybeSingle();

  // A RENEWAL order has no PaymentIntent — it is keyed on stripe_invoice_id —
  // so the lookup above misses it and so does the item fallback inside
  // `revoke`, which is keyed on an intent as well. Production's first
  // chargeback was a renewal and the whole handler ran against `order = null`:
  // "Access revoked (0)", no pause of the buyer's emails, nothing told to
  // Meta, and an alert naming an intent rather than the person, on a dispute
  // with a deadline. Ask Stripe which invoice the charge belongs to and look
  // again.
  if (!order) {
    const invoiceId = await (opts?.invoiceIdFor ?? invoiceIdForDispute)(dispute).catch(() => null);
    if (invoiceId) {
      const { data: byInvoice } = await db
        .from("orders")
        .select("id, email, currency, store_id")
        .eq("stripe_invoice_id", invoiceId)
        .maybeSingle();
      order = byInvoice;
    }
  }

  // Found by either key, revoke what THAT order bought. Only an orphan charge
  // — an upsell billed on its own intent and recorded on the order item —
  // still needs the intent-keyed fallback.
  const { revoked } = order
    ? await revokeOwnershipForOrder(order.id as string)
    : await revoke(piId);

  // Their follow-up emails pause too, as if they had clicked "Stop these
  // emails" (owner's decision, 30 Sep 2026); buying again resumes them. A
  // failure here must not fail the webhook: Stripe would redeliver a dispute
  // whose access is already revoked.
  if (order?.email && order.store_id) {
    const { ok } = await pauseFlowsForBuyer(order.store_id as string, order.email as string, "charged back").catch(() => ({ ok: false }));
    if (!ok) {
      await recordError({
        source: "post_purchase_sequence",
        message: `Chargeback on ${order.email}: could not pause their follow-up emails, so they may keep arriving.`,
        context: { orderId: order.id, disputeId: dispute.id },
      });
    }
  }

  await recordError({
    source: "chargeback",
    message:
      `Chargeback opened on ${order?.email ?? piId} for ${(dispute.amount ?? 0) / 100} ` +
      `${(dispute.currency ?? "usd").toUpperCase()} — reason "${dispute.reason ?? "unknown"}". ` +
      `Access revoked (${revoked}). Evidence is due ${dueLabel(dispute)}; a dispute nobody answers is lost by default.`,
    context: {
      disputeId: dispute.id,
      paymentIntentId: piId,
      orderId: order?.id ?? null,
      reason: dispute.reason ?? null,
      status: dispute.status ?? null,
    },
  });

  if (order) {
    await reportReversal({
      orderId: order.id as string,
      amountCents: dispute.amount ?? 0,
      currency: (dispute.currency as string) ?? (order.currency as string) ?? "usd",
      kind: "Chargeback",
      stripeId: dispute.id,
      occurredAt: dispute.created ?? undefined,
    });
  }
}

/**
 * The invoice a disputed charge belongs to, asked of Stripe.
 *
 * The Dispute object carries a charge and a payment intent, never an invoice,
 * and the charge is the one that holds it. Returns null for a charge that
 * belongs to no invoice — a one-off product sale — which is the ordinary case
 * and not an error.
 */
async function invoiceIdForDispute(dispute: Stripe.Dispute): Promise<string | null> {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return null;
  const charge = await stripe().charges.retrieve(chargeId);
  const invoice = (charge as { invoice?: string | { id?: string } | null }).invoice;
  return typeof invoice === "string" ? invoice : (invoice?.id ?? null);
}

/** A dispute the store won. Says so; does not silently re-grant. */
export async function disputeWon(
  dispute: Stripe.Dispute,
  opts?: { invoiceIdFor?: (dispute: Stripe.Dispute) => Promise<string | null> },
): Promise<void> {
  const piId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id;
  const db = createServiceClient();
  let { data: order } = piId
    ? await db.from("orders").select("id, email").eq("stripe_payment_intent_id", piId).maybeSingle()
    : { data: null };

  // Same renewal blind spot as handleDispute: no PaymentIntent on the order,
  // so without this the "you won" alert names an intent and whoever reads it
  // cannot tell whose access to restore.
  if (!order) {
    const invoiceId = await (opts?.invoiceIdFor ?? invoiceIdForDispute)(dispute).catch(() => null);
    if (invoiceId) {
      const { data: byInvoice } = await db
        .from("orders")
        .select("id, email")
        .eq("stripe_invoice_id", invoiceId)
        .maybeSingle();
      order = byInvoice;
    }
  }

  await recordError({
    source: "chargeback",
    message:
      `Chargeback WON for ${order?.email ?? piId ?? "unknown"} — the funds are back. ` +
      `Access was revoked when the dispute opened and has NOT been restored automatically: ` +
      `re-grant it from the member's page if they should have it.`,
    context: { disputeId: dispute.id, paymentIntentId: piId ?? null, orderId: order?.id ?? null },
  });
}

function dueLabel(dispute: Stripe.Dispute): string {
  const by = dispute.evidence_details?.due_by;
  return by ? new Date(by * 1000).toISOString().slice(0, 10) : "soon — check Stripe";
}

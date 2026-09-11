import "server-only";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { trackServerEvent } from "@/lib/tracking";
import { eventIdFor } from "@/lib/analytics/events";
import { buyerContextFor } from "@/lib/checkout";
import { recordError } from "@/lib/errors";

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
): Promise<void> {
  const piId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id;
  if (!piId) return;

  const db = createServiceClient();
  const { data: order } = await db
    .from("orders")
    .select("id, email, currency")
    .eq("stripe_payment_intent_id", piId)
    .maybeSingle();

  const { revoked } = await revoke(piId);

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

/** A dispute the store won. Says so; does not silently re-grant. */
export async function disputeWon(dispute: Stripe.Dispute): Promise<void> {
  const piId =
    typeof dispute.payment_intent === "string"
      ? dispute.payment_intent
      : dispute.payment_intent?.id;
  const db = createServiceClient();
  const { data: order } = piId
    ? await db.from("orders").select("id, email").eq("stripe_payment_intent_id", piId).maybeSingle()
    : { data: null };

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

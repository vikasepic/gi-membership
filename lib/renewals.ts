import "server-only";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { trackServerEvent } from "@/lib/tracking";
import { eventIdFor } from "@/lib/analytics/events";
import { buyerContextFor } from "@/lib/checkout";
import { sendEmail, buildReceiptEmail } from "@/lib/email";

/**
 * The money that arrives after the checkout.
 *
 * A subscription used to produce exactly one order: the one made at the
 * checkout, which on a 7-day trial is $0. The real charge on day 7, and every
 * renewal after it, reached Stripe and nothing else — no order row, no
 * receipt, no conversion event.
 *
 * The bookkeeping was the smaller half. Meta was told StartTrial at signup and
 * never told the trial converted, so the only purchase signal it had to
 * optimise towards was people who take free trials — the exact failure the
 * comment in track-purchase.tsx was written to avoid.
 *
 * A renewal is an order. Same table, same items, same receipt, and a Purchase
 * keyed on the invoice.
 */

/** Invoices that are NOT the checkout that has already been reported. */
const RENEWAL_REASONS = new Set(["subscription_cycle", "subscription_update", "subscription_threshold"]);

export type RenewalResult =
  | { recorded: false; reason: string }
  | { recorded: true; orderId: string; amountCents: number };

export async function recordRenewal(
  invoice: Stripe.Invoice,
  opts?: {
    /**
     * Email the buyer. Off for the backfill: a receipt for a charge from three
     * months ago is not a receipt, it is a support ticket.
     */
    receipt?: boolean;
    /**
     * Report the conversion. Off for anything outside Meta's seven-day window,
     * which would be refused anyway — and a months-old sale reported as though
     * it were fresh would train delivery on the wrong week.
     */
    track?: boolean;
  },
): Promise<RenewalResult> {
  // `subscription_create` is the invoice raised by the checkout itself. That
  // sale is already an order and already a Purchase; recording it here would
  // bill the buyer nothing twice and count the conversion twice.
  const reason = invoice.billing_reason ?? "";
  if (!RENEWAL_REASONS.has(reason)) return { recorded: false, reason: `billing_reason ${reason || "none"}` };

  // A $0 invoice is a trial period rolling over, or a credit covering the
  // whole amount. Nothing moved, so there is nothing to receipt or report.
  const amountCents = invoice.amount_paid ?? 0;
  if (amountCents <= 0) return { recorded: false, reason: "nothing charged" };

  // Stripe moved tax off the invoice root between API versions. Read it
  // defensively rather than pinning a shape that changes under us — a wrong
  // tax figure on a receipt is worse than none.
  const taxCents = taxOf(invoice);

  const sub = subscriptionIdOf(invoice);
  if (!sub) return { recorded: false, reason: "no subscription" };

  const db = createServiceClient();

  // Who this is, found through the subscription rather than the customer: one
  // Stripe customer can hold several subscriptions, and the renewal belongs to
  // exactly one of them.
  const origin = await originOrderFor(sub);
  if (!origin) return { recorded: false, reason: "no order for subscription" };

  const { data: created, error } = await db
    .from("orders")
    .insert({
      store_id: origin.storeId,
      user_id: origin.userId,
      email: origin.email,
      status: "paid",
      currency: (invoice.currency ?? origin.currency) || "usd",
      subtotal_cents: invoice.subtotal ?? amountCents,
      total_cents: amountCents,
      tax_cents: taxCents,
      stripe_customer_id: origin.stripeCustomerId,
      stripe_invoice_id: invoice.id,
      // Carried so the renewal is attributable to the campaign that won the
      // original sale — a conversion with no match data is a conversion Meta
      // can count but not learn from.
      visitor_id: origin.visitorId,
      tracking_consent: origin.trackingConsent,
      buyer_country: origin.buyerCountry,
    })
    .select("id")
    .single();

  // The unique index on stripe_invoice_id is the idempotency guard. Stripe
  // redelivers on any non-2xx and on its own schedule, and two deliveries
  // racing would otherwise both read "no order yet" and both write one.
  if (error) {
    if (error.code === "23505") return { recorded: false, reason: "already recorded" };
    throw new Error(`recordRenewal order: ${error.message}`);
  }
  const orderId = created.id as string;

  const description = descriptionOf(invoice) ?? origin.description ?? "Subscription";
  const { error: itemErr } = await db.from("order_items").insert({
    store_id: origin.storeId,
    order_id: orderId,
    kind: "renewal",
    product_id: origin.productId,
    offer_id: origin.offerId,
    description,
    amount_cents: amountCents,
    stripe_subscription_id: sub,
  });
  if (itemErr) throw new Error(`recordRenewal item: ${itemErr.message}`);

  // Neither of the two below may fail the webhook: the money is taken and the
  // order is written, and a 500 here has Stripe redeliver an invoice we have
  // already recorded — which the unique index then rejects, turning a missing
  // receipt into an endlessly retried delivery.
  if (opts?.receipt !== false) try {
    await sendEmail(
      origin.email,
      buildReceiptEmail({
        email: origin.email,
        orderId,
        lines: [{ description, amountCents }],
        totalCents: amountCents,
        taxCents,
        currency: (invoice.currency ?? origin.currency) || "usd",
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://grow.greaterinside.com",
      }),
    );
  } catch (e) {
    console.error("[recordRenewal] receipt failed (the order is recorded):", e);
  }

  if (opts?.track !== false) try {
    // Consent was given at the checkout this subscription came from, and it
    // covers what that subscription goes on to charge.
    if (origin.trackingConsent === true) {
      const who = await buyerContextFor(orderId);
      if (who) {
        await trackServerEvent({
          ...who,
          // Keyed on the INVOICE. The order's own id would work too, but the
          // invoice is the thing Stripe will redeliver, so it is the id both
          // sides of a retry agree on.
          eventId: eventIdFor("Purchase", invoice.id ?? orderId),
          eventName: "Purchase",
          valueCents: amountCents,
          currency: (invoice.currency ?? origin.currency) || "usd",
          orderId,
          occurredAt: invoice.created ?? Math.floor(Date.now() / 1000),
        });
      }
    }
  } catch (e) {
    console.error("[recordRenewal] tracking failed (the order is recorded):", e);
  }

  return { recorded: true, orderId, amountCents };
}

/** Total tax on the invoice, across the API versions that moved it. */
function taxOf(invoice: Stripe.Invoice): number {
  const i = invoice as unknown as {
    tax?: number | null;
    total_taxes?: { amount?: number | null }[] | null;
  };
  if (typeof i.tax === "number") return i.tax;
  return (i.total_taxes ?? []).reduce((n, t) => n + (t.amount ?? 0), 0);
}

/** Stripe moved this off the invoice root; read it from either shape. */
function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;
  for (const line of invoice.lines?.data ?? []) {
    const s = (line as unknown as { subscription?: string | null }).subscription;
    if (typeof s === "string") return s;
  }
  return null;
}

/** "Content Engine — monthly", from the invoice's own line rather than ours. */
function descriptionOf(invoice: Stripe.Invoice): string | null {
  const line = invoice.lines?.data?.[0];
  return line?.description?.trim() || null;
}

type Origin = {
  storeId: string;
  userId: string | null;
  email: string;
  currency: string;
  stripeCustomerId: string | null;
  visitorId: string | null;
  trackingConsent: boolean | null;
  buyerCountry: string | null;
  productId: string | null;
  offerId: string | null;
  description: string | null;
};

/**
 * The checkout this subscription came from.
 *
 * Through order_items, which is where the subscription id is written for both
 * a product bought on a recurring plan and an offer. The oldest matching line
 * wins: a renewal recorded by this function also carries the subscription id,
 * and pointing a renewal at the previous renewal would walk the chain instead
 * of reaching the sale.
 */
async function originOrderFor(subscriptionId: string): Promise<Origin | null> {
  const db = createServiceClient();
  const { data: item } = await db
    .from("order_items")
    .select("order_id, product_id, offer_id, description")
    .eq("stripe_subscription_id", subscriptionId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!item) return null;

  const { data: order } = await db
    .from("orders")
    .select(
      "store_id, user_id, email, currency, stripe_customer_id, visitor_id, tracking_consent, buyer_country",
    )
    .eq("id", item.order_id as string)
    .maybeSingle();
  if (!order) return null;

  return {
    storeId: order.store_id as string,
    userId: (order.user_id as string | null) ?? null,
    email: order.email as string,
    currency: (order.currency as string) ?? "usd",
    stripeCustomerId: (order.stripe_customer_id as string | null) ?? null,
    visitorId: (order.visitor_id as string | null) ?? null,
    trackingConsent: (order.tracking_consent as boolean | null) ?? null,
    buyerCountry: (order.buyer_country as string | null) ?? null,
    productId: (item.product_id as string | null) ?? null,
    offerId: (item.offer_id as string | null) ?? null,
    description: (item.description as string | null) ?? null,
  };
}

/**
 * Every renewal Stripe has already collected, written into the books.
 *
 * The handler only sees what arrives from now on, and this store has been
 * taking subscriptions since before it existed — so without this the first
 * months of recurring revenue stay in Stripe alone.
 *
 * Deliberately quiet. No receipts: an email about a charge from three months
 * ago is not a receipt, it is a support ticket. And no conversion event beyond
 * Meta's seven-day window, which would be refused anyway — a months-old sale
 * reported as though it were fresh would train delivery on the wrong week.
 *
 * Safe to run twice: every write goes through recordRenewal, and the unique
 * index on the invoice id is what makes the second run a no-op.
 */
export async function backfillRenewals(opts?: { limit?: number }): Promise<{
  scanned: number;
  recorded: number;
  skipped: Record<string, number>;
  totalCents: number;
}> {
  const { stripe } = await import("@/lib/stripe");
  const limit = opts?.limit ?? 500;
  const freshAfter = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

  const out = { scanned: 0, recorded: 0, skipped: {} as Record<string, number>, totalCents: 0 };
  const note = (reason: string) => {
    out.skipped[reason] = (out.skipped[reason] ?? 0) + 1;
  };

  for await (const invoice of stripe().invoices.list({ status: "paid", limit: 100 })) {
    if (out.scanned >= limit) break;
    out.scanned += 1;
    try {
      const res = await recordRenewal(invoice, {
        receipt: false,
        track: (invoice.created ?? 0) >= freshAfter,
      });
      if (res.recorded) {
        out.recorded += 1;
        out.totalCents += res.amountCents;
      } else {
        note(res.reason);
      }
    } catch (e) {
      // One unrecordable invoice must not end the sweep — the rest are still
      // revenue nobody has booked.
      note(`error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 120));
    }
  }
  return out;
}

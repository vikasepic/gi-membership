import "server-only";
import { recordError, messageOf } from "@/lib/errors";

// Outbound CRM feed — one clean event per thing that actually happened, posted
// to a Zapier Catch Hook (and from there to ActiveCampaign or anywhere else).
//
// Why not tag off Stripe directly: Stripe sees money, not the catalogue. A
// single purchase arrives there as up to three unrelated objects (base
// PaymentIntent, bump charge, subscription), a trial start is a $0 event with no
// charge at all, and a $0 order has no PaymentIntent to fire on. Tagging off
// that means deduplicating three events per buyer and still missing every
// trial. Here the store says exactly what happened, once, with the product slug
// and the course type Stripe never knew about.
//
// NOT gated on tracking consent, deliberately. That gate exists for ad
// measurement — Meta and GA get a hashed email to attribute a conversion. This
// is the same category as the receipt: fulfilling the purchase and servicing the
// customer who just bought. Gating it would silently drop every buyer who
// declined ad tracking out of their own order emails and access notifications.

export type CrmEventType =
  | "purchase"
  | "trial_started"
  | "subscription_active"
  | "subscription_canceled"
  | "subscription_past_due"
  | "trial_ending"
  | "refunded";

/** Mirrors the order_items.kind check constraint — 'product' | 'bump' | 'oto'. */
export type CrmItem = {
  kind: "product" | "bump" | "oto";
  description: string;
  amountCents: number;
  /**
   * Both identifiers, on purpose. productId is the primary key and never
   * changes; productSlug is readable but editable in admin, so a rename would
   * orphan every tag keyed on it. Key automation on the id, label with the slug.
   */
  productId?: string | null;
  productSlug?: string | null;
  /** Set instead of productId on bump/oto rows — those grant an offer. */
  offerId?: string | null;
};

export type CrmEvent = {
  type: CrmEventType;
  email: string;
  occurredAt: number;
  orderId?: string | null;
  items?: CrmItem[];
  totalCents?: number;
  currency?: string;
  productId?: string | null;
  productSlug?: string | null;
  offerName?: string | null;
  stripeSubscriptionId?: string | null;
  /**
   * A purchase whose bump was a trial subscription is BOTH a purchase and a
   * trial start. Typing it as one or the other loses a tag: send `purchase`
   * with this flag set, so the CRM can apply both.
   */
  trialStarted?: boolean;
};

/**
 * Fire-and-forget. Never throws and never blocks the caller on a slow hook: a
 * CRM outage must not fail a paid order, and everything that calls this has
 * already committed its database work.
 *
 * No-ops when CRM_WEBHOOK_URL is unset, so local development and the test suite
 * never post anywhere.
 */
/**
 * Never throws: it runs beside purchases and refunds. A failure is queued for
 * the retry sweep and shows on /admin/errors. It used to be a console line
 * only, so a Zapier hook answering 404 went unnoticed (1 Oct 2026).
 *
 * The retry runner passes `queueOnFailure: false`: it IS the retry, and
 * reads the `false` this returns to record the attempt.
 */
export async function sendCrmEvent(event: CrmEvent, opts: { queueOnFailure?: boolean } = {}): Promise<boolean> {
  const url = process.env.CRM_WEBHOOK_URL;
  if (!url) return true;

  let problem: string;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return true;
    problem = `rejected: ${res.status}`;
  } catch (e) {
    problem = `failed: ${messageOf(e)}`;
  }
  if (opts.queueOnFailure === false) {
    console.error(`[crm] ${event.type} ${problem}`);
  } else {
    await recordError({
      source: "crm",
      message: `CRM ${event.type} ${problem}`,
      context: { type: event.type, email: event.email },
      jobKind: "crm_event",
      jobPayload: event as unknown as Record<string, unknown>,
    });
  }
  return false;
}

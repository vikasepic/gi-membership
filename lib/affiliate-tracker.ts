import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { recordError, messageOf } from "@/lib/errors";

/**
 * The Greater Inside affiliate tracker (owner, 10 Nov 2026).
 *
 * One POST per sale or refund of a tracked offer; the tracker works out from
 * the buyer's email whether an affiliate sent them. Contract:
 * docs/affiliate-tracker.md. Fire-and-forget: nothing here may throw into a
 * checkout or a webhook, and every call carries an event_id, so a retry or a
 * second delivery is a `duplicate`, never a second commission.
 */
export const TRACKER_URL = "https://mindvalley.greaterinside.com/api/webhooks/sale";

/**
 * Offer key -> the tracker's product id. Both Foundations Weekend pages map to
 * the one tracker product: it is one program, and attribution is by email, so
 * a lead who buys on either page is the same sale to the tracker.
 */
export const TRACKED_OFFERS: Record<string, string> = {
  "foundation-weekend": "prod_VTqGCl1V1x69ff",
  "foundations-weekend-mindvalley": "prod_VTqGCl1V1x69ff",
};

export type TrackerBody = {
  product_id: string;
  email: string;
  event: "sale" | "refund";
  event_id: string;
  amount_cents?: number;
  original_event_id?: string;
};

/** The sale's id, fixed per order line, so the refund can name it. */
export const saleEventId = (orderId: string, offerId: string) => `grow_${orderId}_${offerId}`;

/**
 * Send one event. Throws only when trying again could help (network, 5xx), so
 * the retry runner can back off; a 4xx is our payload being wrong, and
 * repeating it would only repeat the refusal.
 */
export async function postToTracker(body: TrackerBody): Promise<string> {
  const secret = process.env.AFFILIATE_WEBHOOK_SECRET;
  if (!secret) return "not_configured";
  const res = await fetch(TRACKER_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (res.status >= 500) throw new Error(`tracker answered ${res.status}`);
  const outcome = ((await res.json().catch(() => null)) as { outcome?: string } | null)?.outcome;
  if (!res.ok) return `refused_${res.status}`;
  return outcome ?? "ok";
}

async function send(body: TrackerBody, context: Record<string, unknown>): Promise<void> {
  try {
    const outcome = await postToTracker(body);
    if (outcome.startsWith("refused_") || outcome === "unmatched_product") {
      await recordError({ source: "affiliate_tracker", message: `Tracker said ${outcome} for ${body.event} ${body.event_id}`, context });
    }
  } catch (e) {
    await recordError({
      source: "affiliate_tracker",
      message: `Could not reach the affiliate tracker for ${body.event} ${body.event_id}: ${messageOf(e)}`,
      context,
      jobKind: "affiliate_event",
      jobPayload: body as unknown as Record<string, unknown>,
    });
  }
}

/** The order's tracked lines, live orders only: a test purchase is no one's commission. */
async function trackedLines(orderId: string) {
  const db = createServiceClient();
  const { data: order } = await db.from("orders").select("email, livemode").eq("id", orderId).maybeSingle();
  if (!order || order.livemode !== true || !order.email) return null;
  const { data: items } = await db
    .from("order_items")
    .select("offer_id, amount_cents, offers(key)")
    .eq("order_id", orderId)
    .not("offer_id", "is", null);
  const lines = (items ?? []).flatMap((i) => {
    const key = (i.offers as unknown as { key: string } | null)?.key;
    const productId = key ? TRACKED_OFFERS[key] : undefined;
    return productId ? [{ offerId: i.offer_id as string, productId, amountCents: i.amount_cents as number }] : [];
  });
  return { email: order.email as string, lines };
}

/** Report a paid order's tracked lines. Never throws. */
export async function reportAffiliateSale(orderId: string): Promise<void> {
  try {
    const found = await trackedLines(orderId);
    for (const l of found?.lines ?? []) {
      await send(
        { product_id: l.productId, email: found!.email, amount_cents: l.amountCents, event: "sale", event_id: saleEventId(orderId, l.offerId) },
        { orderId },
      );
    }
  } catch (e) {
    console.error("[affiliate_tracker] sale report failed:", e);
  }
}

/**
 * Report a refund of a tracked order. `refundedCents` is this refund's own
 * amount; the whole line or more is a full refund, which the contract says to
 * send with no amount. Never throws.
 */
export async function reportAffiliateRefund(args: {
  orderId: string;
  eventId: string;
  refundedCents: number;
}): Promise<void> {
  try {
    const found = await trackedLines(args.orderId);
    for (const l of found?.lines ?? []) {
      const partial = args.refundedCents > 0 && args.refundedCents < l.amountCents;
      await send(
        {
          product_id: l.productId,
          email: found!.email,
          event: "refund",
          event_id: `${args.eventId}_${l.offerId}`,
          original_event_id: saleEventId(args.orderId, l.offerId),
          ...(partial ? { amount_cents: args.refundedCents } : {}),
        },
        { orderId: args.orderId },
      );
    }
  } catch (e) {
    console.error("[affiliate_tracker] refund report failed:", e);
  }
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { trackServerEvent } from "@/lib/tracking";
import { contentNameOr, eventIdFor } from "@/lib/analytics/events";
import { EMPTY_ATTRIBUTION, type Attribution, type Labels } from "@/lib/attribution";

/**
 * What an order is worth, for the browser's copy of the purchase event.
 *
 * Read back from the order rather than passed through the URL. A value in a
 * query string is a value the buyer can edit, and an edited one lands in Meta
 * as real revenue and in Google Ads as a real conversion — quietly training
 * both to bid for the wrong people.
 */
export type TrackingReceipt = {
  orderId: string;
  valueCents: number;
  currency: string;
  /** The recurring value of a trial started on this order, if any. */
  trialCents: number | null;
  email: string | null;
  /** For the browser copy, so both halves of a deduplicated event carry the same labels. */
  attribution: Attribution;
};

export async function purchaseForTracking(paymentIntentId: string): Promise<TrackingReceipt | null> {
  return receiptFor("stripe_payment_intent_id", paymentIntentId);
}

/**
 * The same receipt, found by the order itself.
 *
 * The upsell page needs this. A buyer who is shown one never reaches the
 * thank-you page carrying a payment_intent — /checkout/complete sends them to
 * /checkout/oto, and every way out of that page lands on thank-you (or, for an
 * offer bought through the standalone checkout, /library — see otoBounceHref)
 * with an `oto`/`offer` result and nothing else. So the browser's copy of Purchase
 * never fired for anybody who was offered an upsell, which on this store is
 * everybody buying the product that has one. Only the server copy arrived, so
 * every ad-blocked buyer in that flow was invisible.
 */
export async function purchaseForOrder(orderId: string): Promise<TrackingReceipt | null> {
  return receiptFor("id", orderId);
}

/**
 * The custom event this order's funnel reports under, if it has one.
 *
 * One pixel serves several funnels on this ad account, so a single Purchase
 * cannot be attributed to a campaign. The ads team names an event per funnel
 * and reads that; the name lives on the product row so renaming it is a form
 * rather than a deploy.
 *
 * Found through `order_items`, because an order has no product of its own —
 * it is a basket, and the base line is the one that says which funnel this
 * was. A renewal order has no product line at all and correctly gets nothing:
 * it is not a funnel sale and reporting it as one would tell the ad account a
 * campaign made a sale seven days after it stopped running.
 */
export async function adEventForOrder(
  orderId: string,
): Promise<{ name: string; contentName: string } | null> {
  try {
    const db = createServiceClient();
    const { data: item } = await db
      .from("order_items")
      .select("product_id")
      .eq("order_id", orderId)
      .eq("kind", "product")
      .not("product_id", "is", null)
      .maybeSingle();
    if (!item?.product_id) return null;

    const { data: product } = await db
      .from("products")
      .select("ad_event_name, title, content_name")
      .eq("id", item.product_id as string)
      .maybeSingle();
    const name = (product?.ad_event_name as string | null)?.trim();
    if (!name) return null;
    return {
      name,
      contentName: contentNameOr(
        product?.content_name as string | null | undefined,
        (product?.title as string) ?? name,
      ),
    };
  } catch {
    // Same rule as the receipt: tracking never breaks the page somebody lands
    // on after paying.
    return null;
  }
}

async function receiptFor(column: string, value: string): Promise<TrackingReceipt | null> {
  try {
    const db = createServiceClient();
    const { data: order } = await db
      .from("orders")
      .select("id, total_cents, currency, email, status, utm_first, utm_last, referrer")
      .eq(column, value)
      .maybeSingle();
    if (!order || order.status === "refunded") return null;

    // A trial charges nothing today, so its line is $0 and its worth is the
    // offer's recurring price. Reporting the $0 would tell Meta the trial was
    // worthless; reporting the price as revenue would say money moved.
    const trialCents = (await trialWorthFor(order.id as string)) || null;

    return {
      orderId: order.id as string,
      valueCents: order.total_cents as number,
      currency: (order.currency as string) ?? "usd",
      trialCents,
      email: (order.email as string) ?? null,
      attribution: {
        first: (order.utm_first as Labels | null) ?? {},
        last: (order.utm_last as Labels | null) ?? {},
        referrer: (order.referrer as string | null) ?? null,
      },
    };
  } catch {
    // Tracking must never break the page a buyer lands on after paying.
    return null;
  }
}

/**
 * The recurring worth of every trial started on an order, in cents.
 *
 * A trial line is an order item that charged nothing — the money is the
 * offer's price, later. Reporting the $0 would tell Meta the trial was
 * worthless; reporting the price as revenue would say money moved.
 */
export async function trialWorthFor(orderId: string): Promise<number> {
  try {
    const db = createServiceClient();
    const { data: items } = await db
      .from("order_items")
      .select("offer_id, amount_cents")
      .eq("order_id", orderId);
    const ids = (items ?? [])
      .filter((i) => i.offer_id && (i.amount_cents as number) === 0)
      .map((i) => i.offer_id as string);
    if (ids.length === 0) return 0;
    const { data: offers } = await db.from("offers").select("price_cents").in("id", ids);
    return (offers ?? []).reduce((n, o) => n + (o.price_cents as number), 0);
  } catch {
    return 0;
  }
}

/**
 * A trial that has just become a paying subscription.
 *
 * Sent server-side because it must be: it happens seven days after the visit
 * that caused it, triggered by Stripe, with no browser anywhere. It is also the
 * event worth optimising towards — without it an ad platform learns to find
 * people who take free trials, which is a different and much cheaper audience.
 */
export async function reportTrialConverted(
  stripeSubscriptionId: string,
  userId: string,
): Promise<void> {
  const db = createServiceClient();
  const { data: own } = await db
    .from("ownership")
    .select("offer_id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  if (!own?.offer_id) return;

  const [{ data: offer }, { data: user }] = await Promise.all([
    db.from("offers").select("price_cents, currency, name, content_name").eq("id", own.offer_id as string).maybeSingle(),
    db.from("users").select("email, username").eq("id", userId).maybeSingle(),
  ]);
  if (!offer || !user?.email) return;

  // The click that started the trial, a week ago. `visitors` is keyed on the
  // anonymous cookie, not on a user, so it is reached through the order that
  // attached it — which is the whole reason the order stores visitor_id.
  const { data: order } = await db
    .from("orders")
    .select("visitor_id, buyer_country, client_ip, client_user_agent, source_url, utm_first, utm_last, referrer")
    .eq("user_id", userId)
    .not("visitor_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: visitor } = order?.visitor_id
    ? await db
        .from("visitors")
        .select("click_ids, first_seen_at")
        .eq("id", order.visitor_id as string)
        .maybeSingle()
    : { data: null };

  // The campaign, separately — order-level, not person-level. "Most recent
  // order with a visitor" above is right for IP, country and click ids, which
  // describe the PERSON and are stable across their orders; it is wrong for
  // campaign, which describes the SALE. A repeat buyer who took a trial on
  // product A from campaign X and later bought product B from campaign Y must
  // not have A's trial conversion reported under Y. order_items is where
  // fulfilOffer/fulfilBump record stripe_subscription_id at fulfilment, so
  // it is a direct, unambiguous hop to the order THIS subscription came from.
  // No campaign (EMPTY_ATTRIBUTION) beats the wrong campaign.
  const { data: attributionItem } = await db
    .from("order_items")
    .select("order_id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  const { data: attributionOrder } = attributionItem?.order_id
    ? await db
        .from("orders")
        .select("utm_first, utm_last, referrer")
        .eq("id", attributionItem.order_id as string)
        .maybeSingle()
    : { data: null };
  const attribution: Attribution = attributionOrder
    ? {
        first: (attributionOrder.utm_first as Labels | null) ?? {},
        last: (attributionOrder.utm_last as Labels | null) ?? {},
        referrer: (attributionOrder.referrer as string | null) ?? null,
      }
    : EMPTY_ATTRIBUTION;

  await trackServerEvent({
    eventId: eventIdFor("Subscribe", stripeSubscriptionId),
    eventName: "Subscribe",
    email: user.email as string,
    userId,
    fullName: (user.username as string | null) ?? null,
    country: (order?.buyer_country as string | null) ?? null,
    // The request that bought the trial a week ago. There is no browser here at
    // all — this fires from a Stripe webhook on day seven — so the IP and agent
    // stored on that order are the only true ones this event can carry.
    clientIp: (order?.client_ip as string | null) ?? null,
    userAgent: (order?.client_user_agent as string | null) ?? null,
    sourceUrl: (order?.source_url as string | null) ?? null,
    attribution,
    valueCents: offer.price_cents as number,
    currency: (offer.currency as string) ?? "usd",
    orderId: stripeSubscriptionId,
    clickIds: (visitor?.click_ids as Record<string, string>) ?? {},
    clickTimeMs: visitor?.first_seen_at ? new Date(visitor.first_seen_at as string).getTime() : null,
    contentName: contentNameOr(
      offer.content_name as string | null | undefined,
      (offer.name as string) ?? null,
    ),
    occurredAt: Math.floor(Date.now() / 1000),
  });
}

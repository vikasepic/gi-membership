import "server-only";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { getStoreId } from "@/lib/store";

/**
 * Subscriptions as billing facts, copied from Stripe. Migration 0086.
 *
 * `ownership` says who may open what. This says when a trial ends, when the
 * next charge is, whether it cancels at period end, and how many times it
 * has paid and how much. The webhook writes it on every subscription and
 * invoice event, `backfillSubscriptions` fills it from Stripe once, and the
 * cron reconciles it. Stripe is the truth; this is the copy the admin reads.
 */

export type SubscriptionRow = {
  id: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string | null;
  userId: string | null;
  offerId: string | null;
  productId: string | null;
  status: string;
  amountCents: number;
  currency: string;
  interval: string | null;
  intervalCount: number | null;
  installments: number | null;
  trialStart: string | null;
  trialEnd: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  canceledAt: string | null;
  endedAt: string | null;
  paidInvoices: number;
  paidTotalCents: number;
  firstPaidAt: string | null;
  lastPaidAt: string | null;
  livemode: boolean;
  startedAt: string;
};

/** The row as the table spells it. */
export type SubscriptionInsert = {
  store_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string | null;
  user_id: string | null;
  offer_id: string | null;
  product_id: string | null;
  status: string;
  amount_cents: number;
  currency: string;
  interval: string | null;
  interval_count: number | null;
  installments: number | null;
  trial_start: string | null;
  trial_end: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancel_at: string | null;
  canceled_at: string | null;
  ended_at: string | null;
  paid_invoices: number;
  paid_total_cents: number;
  first_paid_at: string | null;
  last_paid_at: string | null;
  livemode: boolean;
  started_at: string;
  synced_at: string;
};

const at = (s: number | null | undefined): string | null => (s ? new Date(s * 1000).toISOString() : null);

/** What the row links to on our side. */
export type SubscriptionLink = {
  storeId: string;
  userId: string | null;
  offerId: string | null;
  productId: string | null;
};

/**
 * A Stripe subscription and its paid invoices, as a row. Pure.
 *
 * The period lives on the subscription ITEM in this API version; the older
 * top-level fields are read as a fallback so a fixture written the old way
 * still maps. Paid means an invoice with money on it: a trial's $0 invoice is
 * paid in Stripe's eyes and is not a payment in anybody else's.
 */
export function subscriptionRowFrom(
  sub: Stripe.Subscription,
  invoices: ReadonlyArray<Pick<Stripe.Invoice, "amount_paid" | "created" | "status">>,
  link: SubscriptionLink,
  now = new Date(),
): SubscriptionInsert {
  const item = sub.items?.data?.[0];
  const legacy = sub as unknown as { current_period_start?: number | null; current_period_end?: number | null };
  const price = item?.price;
  const paid = invoices
    .filter((i) => i.status === "paid" && (i.amount_paid ?? 0) > 0)
    .sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
  const installments = Number(sub.metadata?.installments ?? 0);
  return {
    store_id: link.storeId,
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null),
    user_id: link.userId,
    offer_id: link.offerId,
    product_id: link.productId,
    status: sub.status,
    amount_cents: (price?.unit_amount ?? 0) * (item?.quantity ?? 1),
    currency: price?.currency ?? sub.currency ?? "usd",
    interval: price?.recurring?.interval ?? null,
    interval_count: price?.recurring?.interval_count ?? null,
    installments: installments >= 2 ? installments : null,
    trial_start: at(sub.trial_start),
    trial_end: at(sub.trial_end),
    current_period_start: at(item?.current_period_start ?? legacy.current_period_start),
    current_period_end: at(item?.current_period_end ?? legacy.current_period_end),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    cancel_at: at(sub.cancel_at),
    canceled_at: at(sub.canceled_at),
    ended_at: at(sub.ended_at),
    paid_invoices: paid.length,
    paid_total_cents: paid.reduce((n, i) => n + (i.amount_paid ?? 0), 0),
    first_paid_at: at(paid[0]?.created),
    last_paid_at: at(paid[paid.length - 1]?.created),
    livemode: sub.livemode !== false,
    started_at: at(sub.start_date) ?? at(sub.created) ?? now.toISOString(),
    synced_at: now.toISOString(),
  };
}

/** Who this subscription belongs to on our side, from the access row or the order line that started it. */
async function linkFor(stripeSubscriptionId: string): Promise<SubscriptionLink> {
  const db = createServiceClient();
  const storeId = await getStoreId();
  const { data: own } = await db
    .from("ownership")
    .select("user_id, offer_id, product_id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (own) {
    return {
      storeId,
      userId: (own.user_id as string) ?? null,
      offerId: (own.offer_id as string) ?? null,
      productId: (own.product_id as string) ?? null,
    };
  }
  const { data: line } = await db
    .from("order_items")
    .select("offer_id, product_id, orders(user_id)")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const order = line ? (Array.isArray(line.orders) ? line.orders[0] : line.orders) : null;
  return {
    storeId,
    userId: ((order as { user_id?: string } | null)?.user_id as string) ?? null,
    offerId: (line?.offer_id as string) ?? null,
    productId: (line?.product_id as string) ?? null,
  };
}

/**
 * Read one subscription from Stripe and write the row. Never throws into a
 * webhook: the caller decides whether a failed sync is worth a retry, and
 * an admin table that is a minute stale is not worth failing a payment for.
 */
export async function syncSubscription(stripeSubscriptionId: string): Promise<SubscriptionInsert> {
  const s = stripe();
  const [sub, invoices] = await Promise.all([
    s.subscriptions.retrieve(stripeSubscriptionId),
    s.invoices.list({ subscription: stripeSubscriptionId, status: "paid", limit: 100 }),
  ]);
  const row = subscriptionRowFrom(sub, invoices.data, await linkFor(stripeSubscriptionId));
  const db = createServiceClient();
  const { error } = await db.from("subscriptions").upsert(row, { onConflict: "stripe_subscription_id" });
  if (error) throw new Error(`syncSubscription: ${error.message}`);
  return row;
}

/** The same, swallowing failure the way every webhook side effect here does. */
export async function syncSubscriptionQuietly(stripeSubscriptionId: string | null | undefined): Promise<void> {
  if (!stripeSubscriptionId) return;
  try {
    await syncSubscription(stripeSubscriptionId);
  } catch (e) {
    console.error("[subscriptions] sync failed:", e);
  }
}

/**
 * Every subscription we have ever recorded, re-read from Stripe.
 *
 * Walks OUR ids — the access rows and the order lines — rather than listing
 * Stripe's subscriptions: the account is shared with other apps, and a
 * listing would be mostly theirs.
 */
export async function backfillSubscriptions(): Promise<{ scanned: number; synced: number; failed: string[] }> {
  const db = createServiceClient();
  const [{ data: owns }, { data: lines }] = await Promise.all([
    db.from("ownership").select("stripe_subscription_id").not("stripe_subscription_id", "is", null),
    db.from("order_items").select("stripe_subscription_id").not("stripe_subscription_id", "is", null),
  ]);
  const ids = [
    ...new Set([...(owns ?? []), ...(lines ?? [])].map((r) => r.stripe_subscription_id as string).filter(Boolean)),
  ];
  const out = { scanned: ids.length, synced: 0, failed: [] as string[] };
  for (const id of ids) {
    try {
      await syncSubscription(id);
      out.synced += 1;
    } catch (e) {
      out.failed.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

/** Every row, newest first. */
export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("subscriptions")
    .select("*")
    .eq("store_id", await getStoreId())
    .order("started_at", { ascending: false });
  if (error) throw new Error(`listSubscriptions: ${error.message}`);
  return (data ?? []).map(rowOf);
}

export function rowOf(r: Record<string, unknown>): SubscriptionRow {
  return {
    id: r.id as string,
    stripeSubscriptionId: r.stripe_subscription_id as string,
    stripeCustomerId: (r.stripe_customer_id as string) ?? null,
    userId: (r.user_id as string) ?? null,
    offerId: (r.offer_id as string) ?? null,
    productId: (r.product_id as string) ?? null,
    status: r.status as string,
    amountCents: (r.amount_cents as number) ?? 0,
    currency: (r.currency as string) ?? "usd",
    interval: (r.interval as string) ?? null,
    intervalCount: (r.interval_count as number) ?? null,
    installments: (r.installments as number) ?? null,
    trialStart: (r.trial_start as string) ?? null,
    trialEnd: (r.trial_end as string) ?? null,
    currentPeriodStart: (r.current_period_start as string) ?? null,
    currentPeriodEnd: (r.current_period_end as string) ?? null,
    cancelAtPeriodEnd: Boolean(r.cancel_at_period_end),
    cancelAt: (r.cancel_at as string) ?? null,
    canceledAt: (r.canceled_at as string) ?? null,
    endedAt: (r.ended_at as string) ?? null,
    paidInvoices: (r.paid_invoices as number) ?? 0,
    paidTotalCents: (r.paid_total_cents as number) ?? 0,
    firstPaidAt: (r.first_paid_at as string) ?? null,
    lastPaidAt: (r.last_paid_at as string) ?? null,
    livemode: r.livemode !== false,
    startedAt: r.started_at as string,
  };
}

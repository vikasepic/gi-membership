import "server-only";
import { money } from "@/lib/money";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { getStoreId } from "@/lib/store";
import { allRows } from "@/lib/traffic";

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
  /** What Stripe will take at the next renewal, from its preview. Null: unknown or none. */
  nextChargeCents: number | null;
  /** The discount behind that figure, in the coupon's own terms. */
  nextChargeNote: string | null;
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
  next_charge_cents: number | null;
  next_charge_note: string | null;
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
  /** Stripe's preview of the next invoice. Absent: nothing will be charged, or it could not be read. */
  next?: { amountDue: number; discounted: boolean },
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
    next_charge_cents: next ? next.amountDue : null,
    // A coupon whose months are used stays attached; only one that still
    // takes something off this charge is worth a note beside its amount.
    next_charge_note: next?.discounted ? discountNote(sub.discounts) : null,
  };
}

/**
 * The discounts on a subscription, in the coupon's own terms: "Content Engine
 * free month: 100% off, this charge only". Null when there are none, or when
 * Stripe handed back an id instead of the discount (the read did not expand
 * it), because a guessed note is worse than none.
 */
export function discountNote(discounts: ReadonlyArray<string | Stripe.Discount> | null | undefined): string | null {
  const notes = (discounts ?? []).flatMap((d) => {
    const c = typeof d === "string" ? null : d.source?.coupon;
    if (!c || typeof c === "string") return [];
    const off = c.percent_off != null ? `${c.percent_off}% off` : c.amount_off != null ? `${money(c.amount_off, c.currency ?? "usd")} off` : null;
    if (!off) return [];
    const months = c.duration_in_months ?? 0;
    const lasts =
      c.duration === "once" ? ", this charge only" : c.duration === "forever" ? " every charge" : months ? ` for ${months} month${months === 1 ? "" : "s"}` : "";
    return [`${c.name?.trim() ? `${c.name.trim()}: ` : ""}${off}${lasts}`];
  });
  return notes.length ? notes.join("; ") : null;
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
 * Whether a subscription on the Stripe account is this store's.
 *
 * The account is shared: the Greater Inside community on Circle, the Funnel
 * App's own signup and another app all bill through it, and the webhook hears
 * every one of their subscription events. Copying those in put Circle's $300
 * membership on the Transactions page as a nameless "Cancelled Subscription"
 * (29 Sep 2026) and sent a Funnel App signup the store's trial reminder.
 *
 * Ours: created by this store (it stamps store_created on both subscription
 * sites in lib/checkout.ts), or tied to a Grow offer or product here. A
 * subscription a connected app bills itself is NOT ours even when the app
 * reports it on a member's access row: decided 30 Sep 2026, the member keeps
 * the access, the app keeps the payments and the status. See lib/app-billed.
 */
export function belongsToStore(sub: Pick<Stripe.Subscription, "metadata">, link: SubscriptionLink): boolean {
  return sub.metadata?.store_created === "true" || Boolean(link.offerId || link.productId);
}

/**
 * Read one subscription from Stripe and write the row, if it is ours. Never
 * throws into a webhook: the caller decides whether a failed sync is worth a
 * retry, and an admin table that is a minute stale is not worth failing a
 * payment for. Null for a subscription that belongs to someone else.
 */
export async function syncSubscription(stripeSubscriptionId: string): Promise<SubscriptionInsert | null> {
  const s = stripe();
  const [sub, invoices] = await Promise.all([
    // Expanded to the coupon, so the member page can say why a charge is not the price.
    s.subscriptions.retrieve(stripeSubscriptionId, { expand: ["discounts.source.coupon"] }),
    s.invoices.list({ subscription: stripeSubscriptionId, status: "paid", limit: 100 }),
  ]);
  const link = await linkFor(stripeSubscriptionId);
  if (!belongsToStore(sub, link)) return null;
  const row = subscriptionRowFrom(sub, invoices.data, link, new Date(), await nextCharge(sub));
  const db = createServiceClient();
  const { error } = await db.from("subscriptions").upsert(row, { onConflict: "stripe_subscription_id" });
  if (error) throw new Error(`syncSubscription: ${error.message}`);
  return row;
}

/**
 * What Stripe will take at the next renewal: its own preview of the next
 * invoice, so coupons and tax are already in it. Only for a subscription that
 * will renew; one that is ending has no next charge. A preview that fails
 * leaves the figure unknown rather than failing the sync around it.
 */
async function nextCharge(sub: Stripe.Subscription): Promise<{ amountDue: number; discounted: boolean } | undefined> {
  const renews = ["active", "trialing", "past_due"].includes(sub.status) && !sub.cancel_at_period_end && !sub.cancel_at;
  if (!renews) return undefined;
  try {
    const preview = await stripe().invoices.createPreview({ subscription: sub.id });
    return { amountDue: preview.amount_due, discounted: (preview.total_discount_amounts ?? []).some((d) => d.amount > 0) };
  } catch (e) {
    console.error(`[subscriptions] preview of ${sub.id} failed:`, e instanceof Error ? e.message : e);
    return undefined;
  }
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
      if (await syncSubscription(id)) out.synced += 1;
    } catch (e) {
      out.failed.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

/**
 * Every row, newest first. Paged: PostgREST stops at 1000 without saying so,
 * and newest first would drop the oldest subscriptions with their renewals.
 */
export async function listSubscriptions(): Promise<SubscriptionRow[]> {
  const db = createServiceClient();
  const storeId = await getStoreId();
  const rows = await allRows<Record<string, unknown>>((from, to) =>
    db
      .from("subscriptions")
      .select("*")
      .eq("store_id", storeId)
      // Grow-sold only. Rows written before belongsToStore existed include
      // other systems' subscriptions and connected apps' own billing. Hidden,
      // not deleted.
      .or("offer_id.not.is.null,product_id.not.is.null")
      .order("started_at", { ascending: false })
      .order("id")
      .range(from, to)
      // allRows forgives a failed page; a money screen must not read it as
      // "no subscriptions".
      .then((r) => {
        if (r.error) throw new Error(`listSubscriptions: ${r.error.message}`);
        return { data: r.data as Record<string, unknown>[] };
      }),
  );
  return rows.map(rowOf);
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
    nextChargeCents: (r.next_charge_cents as number | null) ?? null,
    nextChargeNote: (r.next_charge_note as string | null) ?? null,
  };
}

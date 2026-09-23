import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { allRows } from "@/lib/traffic";
import { getStoreId } from "@/lib/store";
import { listSubscriptions, type SubscriptionRow } from "@/lib/subscriptions";
import type { Labels } from "@/lib/attribution";

/**
 * Everything the money screens derive from, read once.
 *
 * Members, Transactions, Trials and the person page are all views over the
 * same rows — users, orders and their lines, subscriptions, access — so they
 * share one loader and one set of shapes. The derivations in
 * lib/member-money.ts, lib/ledger.ts and lib/trials-view.ts are pure over
 * this, which is what makes them testable without a database.
 */

export type UserRow = { id: string; email: string; name: string | null; isAdmin: boolean; createdAt: string };
export type OrderRowLite = {
  id: string;
  userId: string | null;
  email: string;
  status: "pending" | "paid" | "failed" | "refunded";
  totalCents: number;
  currency: string;
  livemode: boolean;
  createdAt: string;
  updatedAt: string;
  stripeInvoiceId: string | null;
  stripePaymentIntentId: string | null;
  hostOfferId: string | null;
  utmFirst: Labels;
  utmLast: Labels;
  referrer: string | null;
};
export type ItemRow = {
  orderId: string;
  kind: "product" | "bump" | "oto" | "renewal";
  description: string;
  amountCents: number;
  offerId: string | null;
  productId: string | null;
  stripeSubscriptionId: string | null;
};
export type OwnershipRow = {
  userId: string;
  productId: string | null;
  offerId: string | null;
  appId: string | null;
  status: string;
  stripeSubscriptionId: string | null;
};
export type Names = {
  offers: Map<string, { name: string; contentName: string | null; billingType: string; priceCents: number }>;
  products: Map<string, { name: string; priceCents: number }>;
  apps: Map<string, string>;
};

export type MoneyData = {
  users: UserRow[];
  orders: OrderRowLite[];
  items: ItemRow[];
  subscriptions: SubscriptionRow[];
  ownership: OwnershipRow[];
  names: Names;
  now: Date;
};

export async function loadMoneyData(): Promise<MoneyData> {
  const db = createServiceClient();
  const storeId = await getStoreId();
  // Users, orders and ownership are paged. PostgREST caps a select at 1000
  // rows and says nothing, and all three grow with the store: at the cap the
  // money screens would quietly start losing members, and the ORDER BY would
  // decide which. Found 23 Sep 2026 on a local store of 1062 users, where a
  // real member 404ed on their own page. Offers, products and apps are
  // hand-made lists and will not approach it.
  const [users, orders, subscriptions, ownership, offers, products, apps] = await Promise.all([
    allRows<Record<string, unknown>>((from, to) =>
      db.from("users").select("id, email, username, is_admin, created_at").eq("store_id", storeId)
        .order("created_at", { ascending: true }).range(from, to),
    ),
    allRows<Record<string, unknown>>((from, to) =>
      db
        .from("orders")
        .select(
          "id, user_id, email, status, total_cents, currency, livemode, created_at, updated_at, stripe_invoice_id, stripe_payment_intent_id, host_offer_id, utm_first, utm_last, referrer",
        )
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    listSubscriptions(),
    allRows<Record<string, unknown>>((from, to) =>
      db.from("ownership").select("user_id, product_id, offer_id, app_id, status, stripe_subscription_id")
        .eq("store_id", storeId).order("user_id", { ascending: true }).range(from, to),
    ),
    db.from("offers").select("id, name, content_name, billing_type, price_cents").eq("store_id", storeId),
    db.from("products").select("id, title, price_cents").eq("store_id", storeId),
    db.from("apps").select("id, name"),
  ]);
  for (const r of [offers, products, apps]) {
    if (r.error) throw new Error(`loadMoneyData: ${r.error.message}`);
  }
  const orderIds = (orders).map((o) => o.id as string);
  // Every line at once. PostgREST caps a select at 1000 rows and this list
  // grows one row per sale, so it is paged rather than trusted.
  const items: ItemRow[] = [];
  for (let i = 0; i < orderIds.length; i += 200) {
    const { data, error } = await db
      .from("order_items")
      .select("order_id, kind, description, amount_cents, offer_id, product_id, stripe_subscription_id")
      .in("order_id", orderIds.slice(i, i + 200));
    if (error) throw new Error(`loadMoneyData items: ${error.message}`);
    for (const it of data ?? []) {
      items.push({
        orderId: it.order_id as string,
        kind: it.kind as ItemRow["kind"],
        description: it.description as string,
        amountCents: (it.amount_cents as number) ?? 0,
        offerId: (it.offer_id as string) ?? null,
        productId: (it.product_id as string) ?? null,
        stripeSubscriptionId: (it.stripe_subscription_id as string) ?? null,
      });
    }
  }
  return {
    users: (users).map((u) => ({
      id: u.id as string,
      email: u.email as string,
      name: (u.username as string) ?? null,
      isAdmin: Boolean(u.is_admin),
      createdAt: u.created_at as string,
    })),
    orders: (orders).map((o) => ({
      id: o.id as string,
      userId: (o.user_id as string) ?? null,
      email: o.email as string,
      status: o.status as OrderRowLite["status"],
      totalCents: (o.total_cents as number) ?? 0,
      currency: (o.currency as string) ?? "usd",
      livemode: o.livemode !== false,
      createdAt: o.created_at as string,
      updatedAt: (o.updated_at as string) ?? (o.created_at as string),
      stripeInvoiceId: (o.stripe_invoice_id as string) ?? null,
      stripePaymentIntentId: (o.stripe_payment_intent_id as string) ?? null,
      hostOfferId: (o.host_offer_id as string) ?? null,
      utmFirst: (o.utm_first as Labels | null) ?? {},
      utmLast: (o.utm_last as Labels | null) ?? {},
      referrer: (o.referrer as string) ?? null,
    })),
    items,
    subscriptions,
    ownership: (ownership).map((o) => ({
      userId: o.user_id as string,
      productId: (o.product_id as string) ?? null,
      offerId: (o.offer_id as string) ?? null,
      appId: (o.app_id as string) ?? null,
      status: o.status as string,
      stripeSubscriptionId: (o.stripe_subscription_id as string) ?? null,
    })),
    names: {
      offers: new Map(
        (offers.data ?? []).map((o) => [
          o.id as string,
          {
            name: o.name as string,
            contentName: (o.content_name as string) ?? null,
            billingType: (o.billing_type as string) ?? "one_time",
            priceCents: (o.price_cents as number) ?? 0,
          },
        ]),
      ),
      products: new Map((products.data ?? []).map((p) => [p.id as string, { name: p.title as string, priceCents: (p.price_cents as number) ?? 0 }])),
      apps: new Map((apps.data ?? []).map((a) => [a.id as string, a.name as string])),
    },
    now: new Date(),
  };
}

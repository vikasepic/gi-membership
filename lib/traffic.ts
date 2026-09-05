import "server-only";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { sourceOf, isBot } from "@/lib/traffic-source";

/**
 * Counting what actually happened on the site.
 *
 * Everything here swallows its own errors. It runs on the pages that take
 * money, and a count is worth less than a page load — a counter that could
 * break a checkout would be a bad trade at any accuracy.
 */

export type CountRow = {
  day: string;
  path: string;
  source: string;
  product: string;
  hits: number;
};
export type BoughtRow = { product: string; orders: number };
export type ProductName = { slug: string; title: string };

/**
 * The raw increment, which DOES throw — but only on a transport failure or a
 * bad store lookup. It does not inspect the `{ error }` supabase-js returns,
 * so a database-level error (missing table, bad RPC signature, migration not
 * yet applied) comes back in the result rather than as a rejection.
 *
 * That is deliberate, not an oversight: it is what lets code deployed ahead
 * of its own migration degrade to a silent no-op instead of throwing on
 * every page view. Named so because everything else in this file swallows
 * its errors and this one deliberately does not for transport/lookup
 * failures: the integration test calls it directly, and a version that
 * caught those too would pass while the write was broken. `recordPageHit` is
 * the safe door and the one pages use — it wraps this.
 */
export async function bumpPageCountOrThrow(
  path: string,
  source: string,
  product = "",
): Promise<void> {
  const db = createServiceClient();
  await db.rpc("bump_page_count", {
    p_store: await getStoreId(),
    p_day: new Date().toISOString().slice(0, 10),
    p_path: path,
    p_source: source,
    p_product: product,
  });
}

/**
 * Count this view, from whatever the request happens to say.
 *
 * `product` is the slug this view was about, and it is the caller's job
 * because only the caller knows: the sales pages have it in their path, the
 * checkout has resolved it to a real row before it renders, and everything
 * else has none. It defaults to "" so a page with no product does not have to
 * say so.
 *
 * Never awaited by its callers and never throws, so a slow database or a
 * failed write cannot delay a page or break one.
 */
export async function recordPageHit(path: string, product = ""): Promise<void> {
  try {
    const h = await headers();
    if (isBot(h.get("user-agent"))) return;
    await bumpPageCountOrThrow(
      path,
      sourceOf(h.get("x-search") ?? "", h.get("referer")),
      product,
    );
  } catch {
    // Deliberately silent. See the note at the top of this file.
  }
}

/**
 * The base product an order was for.
 *
 * Two queries rather than a PostgREST embed: the embed's shape depends on how
 * the relationship is detected, and this runs behind a fire-and-forget count
 * where a silently-wrong shape would never surface. `kind = 'product'` is the
 * base row — a bump or an accepted upsell is an offer, not what was bought
 * first.
 */
async function orderProductSlug(orderId: string): Promise<string> {
  const db = createServiceClient();
  const { data: items } = await db
    .from("order_items")
    .select("product_id")
    .eq("order_id", orderId)
    .eq("kind", "product")
    .not("product_id", "is", null)
    .limit(1);
  const productId = items?.[0]?.product_id as string | undefined;
  if (!productId) return "";
  const { data: product } = await db
    .from("products")
    .select("slug")
    .eq("id", productId)
    .maybeSingle();
  return (product?.slug as string) ?? "";
}

/**
 * The upsell's own view, filed under the product the order was for.
 *
 * The slug is not on the request — it is behind the order the signed token
 * names — so the lookup happens here rather than on the page, which would
 * have to await it before rendering. Wrapped so the page can still fire and
 * forget: a count must not put a query in front of an upsell.
 */
export async function recordOtoPageHit(orderId: string): Promise<void> {
  try {
    await recordPageHit("/checkout/oto", await orderProductSlug(orderId));
  } catch {
    // Deliberately silent, like everything else in this file.
  }
}

/**
 * The first day of the window, as an ISO date — how `page_counts.day` is keyed.
 *
 * `daysInRange` in `lib/traffic-funnel.ts` is the definition every window here
 * follows: the last N UTC calendar days INCLUDING today, so `days - 1` back and
 * not `days`. Every reader in this file derives from it so they cannot
 * drift apart again — when they disagreed, a row on the oldest day counted
 * towards a card's totals but not towards the chart beside them, and the card
 * contradicted itself at the boundary with nothing on screen to show it.
 */
function windowStart(days: number): string {
  return new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * How many visitors the consented layer saw in the same window.
 *
 * The spec's second layer. Shown beside the true totals so the gap between
 * them is visible: that difference is the share of real traffic the pixel and
 * GA4 never saw, which is the number nobody could measure before this page.
 *
 * Bounded by the same UTC midnight as the other three, because `CoverageNote`
 * prints this number on the same line as the views it is compared against.
 * Refusing to turn that pair into a percentage is a reason not to panic about
 * the gap, not a licence for the two halves to measure different spans.
 */
export async function consentedVisitorCount(days: number): Promise<number> {
  try {
    const since = `${windowStart(days)}T00:00:00.000Z`;
    const db = createServiceClient();
    const { count } = await db
      .from("visitors")
      .select("id", { count: "exact", head: true })
      .eq("store_id", await getStoreId())
      .gte("first_seen_at", since);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Every counted row in the window, in one query.
 *
 * The funnel, the daily series, the source split and the other-pages list are
 * all shaped from this same list rather than from a query each. At a few dozen
 * rows a day over at most ninety days that is a small read, and it means those
 * four things cannot disagree with each other about what the window held.
 */
export async function pageCountsSince(days: number): Promise<CountRow[]> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("page_counts")
      .select("day, path, source, product, hits")
      .eq("store_id", await getStoreId())
      .gte("day", windowStart(days))
      .order("day", { ascending: true });
    return (data ?? []) as CountRow[];
  } catch {
    return [];
  }
}

/**
 * How many real orders each product took in the window.
 *
 * The funnel's last step, and the only step that is people rather than views:
 * it comes from the ledger, so the bottom of the funnel reconciles with
 * revenue. Test-mode rows are excluded — two of them are sitting in production
 * and counting them would overstate a launch by a third.
 *
 * Three small queries instead of one embedded join: order volume is tiny, and
 * a PostgREST embed's shape here would be a silent wrong answer rather than an
 * error if the relationship were detected differently.
 */
export async function paidByProduct(days: number): Promise<BoughtRow[]> {
  try {
    const db = createServiceClient();
    const store = await getStoreId();
    // UTC midnight of the window's first day, not a rolling `days * 24h`:
    // `page_counts.day` is written from `toISOString()`, so the three view
    // steps are bounded by UTC midnights and this step has to be too. A
    // rolling cutoff would leave the last step counting a different span from
    // the three above it, by however many hours into the day it is now.
    const since = `${windowStart(days)}T00:00:00.000Z`;

    const { data: orders } = await db
      .from("orders")
      .select("id")
      .eq("store_id", store)
      .eq("status", "paid")
      .eq("livemode", true)
      .gte("created_at", since);
    const ids = (orders ?? []).map((o) => o.id as string);
    if (ids.length === 0) return [];

    const { data: items } = await db
      .from("order_items")
      .select("order_id, product_id")
      .in("order_id", ids)
      .eq("kind", "product")
      .not("product_id", "is", null);

    const { data: products } = await db
      .from("products")
      .select("id, slug")
      .eq("store_id", store);
    const slugOf = new Map((products ?? []).map((p) => [p.id as string, p.slug as string]));

    // Distinct ORDERS per product: an order with two rows for the same product
    // is one sale, and counting rows would inflate the step it feeds.
    const seen = new Map<string, Set<string>>();
    for (const i of items ?? []) {
      const slug = slugOf.get(i.product_id as string);
      if (!slug) continue;
      const set = seen.get(slug) ?? new Set<string>();
      set.add(i.order_id as string);
      seen.set(slug, set);
    }
    return [...seen.entries()].map(([product, set]) => ({ product, orders: set.size }));
  } catch {
    return [];
  }
}

/**
 * Every product in the catalogue, published or not.
 *
 * Unpublished ones are included on purpose: a product that sold and was then
 * taken down still has orders, and dropping it would make this page's numbers
 * disagree with the orders page.
 */
export async function productNames(): Promise<ProductName[]> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("products")
      .select("slug, title")
      .eq("store_id", await getStoreId());
    return (data ?? []) as ProductName[];
  } catch {
    return [];
  }
}

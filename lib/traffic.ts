import "server-only";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { sourceOf, isBot } from "@/lib/traffic-source";
import type { DayRange } from "@/lib/traffic-funnel";

/**
 * UTC midnight AFTER a window's last day.
 *
 * `page_counts.day` is a date and its window is inclusive; `orders.created_at`
 * is a timestamp, so the same window is `>= start` and `< the day after end`.
 * Written once because getting it wrong drops or adds a whole day of orders
 * against view counts that did not move, and nothing on screen would say so.
 */
function endExclusive(range: DayRange): string {
  return `${new Date(Date.parse(`${range.end}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`;
}

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

/** The clock read, in one place, so the shape of "today" is written once. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Every row of a select, not the first thousand of them.
 *
 * PostgREST caps a response at `max_rows` (1000, per `supabase/config.toml`)
 * and truncates SILENTLY — a partial `Content-Range` and no error. This page
 * orders by `day asc`, so a truncation would shed TODAY: the owner opens the
 * 90-day view after a launch and the launch week reads zero, with nothing on
 * screen saying anything was dropped. A slow page is a far better failure than
 * a confidently wrong one.
 *
 * The ceiling stops a pathological table spinning; hitting it returns what we
 * have, because every reader in this file promises a possibly-empty list and
 * never a throw.
 */
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data } = await page(i * PAGE_SIZE, i * PAGE_SIZE + PAGE_SIZE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

/**
 * `.in(...)` in slices, because it travels in the GET query string.
 *
 * A thousand UUIDs is roughly 37KB of URL, which a proxy answers with a 414 —
 * and that lands in the caller's `catch` and reads as "nobody bought".
 */
function chunks<T>(list: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, i * size + size),
  );
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
export async function consentedVisitorCount(range: DayRange): Promise<number> {
  try {
    const since = `${range.start}T00:00:00.000Z`;
    const db = createServiceClient();
    const { count } = await db
      .from("visitors")
      .select("id", { count: "exact", head: true })
      .eq("store_id", await getStoreId())
      .gte("first_seen_at", since)
      .lt("first_seen_at", endExclusive(range));
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
export async function pageCountsSince(range: DayRange): Promise<CountRow[]> {
  try {
    const db = createServiceClient();
    const store = await getStoreId();
    // Paged, not capped. The product column multiplies rows per day and the
    // range now runs to 90 of them, so a single select is well inside the
    // distance where PostgREST would truncate — see `allRows`.
    return await allRows<CountRow>((from, to) =>
      db
        .from("page_counts")
        .select("day, path, source, product, hits")
        .eq("store_id", store)
        .gte("day", range.start)
        .lte("day", range.end)
        // `day` alone is not a total order, and an offset-paged read over a
        // partial order can repeat one row and skip another. The rest of the
        // primary key makes it total.
        .order("day", { ascending: true })
        .order("path", { ascending: true })
        .order("source", { ascending: true })
        .order("product", { ascending: true })
        .range(from, to),
    );
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
export async function paidByProduct(range: DayRange): Promise<BoughtRow[]> {
  try {
    const db = createServiceClient();
    const store = await getStoreId();
    // UTC midnight of the window's first day, and the midnight AFTER its last,
    // not a rolling `days * 24h`: `page_counts.day` is written from
    // `toISOString()`, so the three view steps are bounded by UTC midnights and
    // this step has to be too. A rolling cutoff would leave the last step
    // counting a different span from the three above it, by however many hours
    // into the day it is now.
    const since = `${range.start}T00:00:00.000Z`;

    // Paged for the same reason as `pageCountsSince`: a truncated read here
    // returns fewer orders than there were and understates revenue, which is
    // the one direction this page must never be wrong in.
    const orders = await allRows<{ id: string }>((from, to) =>
      db
        .from("orders")
        .select("id")
        .eq("store_id", store)
        .eq("status", "paid")
        .eq("livemode", true)
        .gte("created_at", since)
        .lt("created_at", endExclusive(range))
        .order("id", { ascending: true })
        .range(from, to),
    );
    const ids = orders.map((o) => o.id);
    if (ids.length === 0) return [];

    // In batches: every id rides in the GET query string, and the whole list
    // at volume is a URL a proxy refuses with a 414. The dedup below merges
    // batches safely, so splitting the read changes no answer.
    const items: { order_id: string; product_id: string }[] = [];
    for (const batch of chunks(ids, 200)) {
      items.push(
        ...(await allRows<{ order_id: string; product_id: string }>((from, to) =>
          db
            .from("order_items")
            .select("order_id, product_id")
            .in("order_id", batch)
            .eq("kind", "product")
            .not("product_id", "is", null)
            .order("id", { ascending: true })
            .range(from, to),
        )),
      );
    }

    const { data: products } = await db
      .from("products")
      .select("id, slug")
      .eq("store_id", store);
    const slugOf = new Map((products ?? []).map((p) => [p.id as string, p.slug as string]));

    // Distinct ORDERS per product: an order with two rows for the same product
    // is one sale, and counting rows would inflate the step it feeds.
    const seen = new Map<string, Set<string>>();
    for (const i of items) {
      const slug = slugOf.get(i.product_id);
      if (!slug) continue;
      const set = seen.get(slug) ?? new Set<string>();
      set.add(i.order_id);
      seen.set(slug, set);
    }
    return [...seen.entries()].map(([product, set]) => ({ product, orders: set.size }));
  } catch {
    return [];
  }
}

/**
 * How many orders each OFFER sold, keyed by the offer's key.
 *
 * The fourth step of an offer's funnel. `paidByProduct` counts base-product
 * order lines, and an offer has none — the line it writes carries the same
 * kind ('oto') an accepted upsell does, so the two are indistinguishable
 * there. `orders.host_offer_id` says which offer the order was opened for,
 * which is exactly the question the funnel asks.
 *
 * Same window arithmetic, `livemode` filter and paging as paidByProduct, for
 * the reasons its comments give.
 */
export async function paidByOffer(range: DayRange): Promise<BoughtRow[]> {
  try {
    const db = createServiceClient();
    const store = await getStoreId();
    const since = `${range.start}T00:00:00.000Z`;

    const orders = await allRows<{ id: string; host_offer_id: string }>((from, to) =>
      db
        .from("orders")
        .select("id, host_offer_id")
        .eq("store_id", store)
        .eq("status", "paid")
        .eq("livemode", true)
        .not("host_offer_id", "is", null)
        .gte("created_at", since)
        .lt("created_at", endExclusive(range))
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (orders.length === 0) return [];

    const { data: offers } = await db
      .from("offers")
      .select("id, key")
      .eq("store_id", store);
    const keyOf = new Map((offers ?? []).map((o) => [o.id as string, o.key as string]));

    // Distinct ORDERS per offer. One order has one host offer, so this is a
    // count rather than a dedup — but it is written as a set for the same
    // reason paidByProduct is: a paged read can hand back a row twice.
    const seen = new Map<string, Set<string>>();
    for (const o of orders) {
      const key = keyOf.get(o.host_offer_id);
      if (!key) continue;
      const set = seen.get(key) ?? new Set<string>();
      set.add(o.id);
      seen.set(key, set);
    }
    return [...seen.entries()].map(([product, ids]) => ({ product, orders: ids.size }));
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

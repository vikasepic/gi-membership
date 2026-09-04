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

export type TrafficRow = { path: string; source: string; hits: number };

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
export async function bumpPageCountOrThrow(path: string, source: string): Promise<void> {
  const db = createServiceClient();
  await db.rpc("bump_page_count", {
    p_store: await getStoreId(),
    p_day: new Date().toISOString().slice(0, 10),
    p_path: path,
    p_source: source,
  });
}

/**
 * Count this view, from whatever the request happens to say.
 *
 * Never awaited by its callers and never throws, so a slow database or a
 * failed write cannot delay a page or break one.
 */
export async function recordPageHit(path: string): Promise<void> {
  try {
    const h = await headers();
    if (isBot(h.get("user-agent"))) return;
    await bumpPageCountOrThrow(path, sourceOf(h.get("x-search") ?? "", h.get("referer")));
  } catch {
    // Deliberately silent. See the note at the top of this file.
  }
}

/**
 * How many visitors the consented layer saw in the same window.
 *
 * The spec's second layer. Shown beside the true totals so the gap between
 * them is visible: that difference is the share of real traffic the pixel and
 * GA4 never saw, which is the number nobody could measure before this page.
 */
export async function consentedVisitorCount(days: number): Promise<number> {
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
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

/** Every page and source with a hit in the last `days` days, busiest first. */
export async function trafficByPage(days: number): Promise<TrafficRow[]> {
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const db = createServiceClient();
    const { data } = await db
      .from("page_counts")
      .select("path, source, hits")
      .eq("store_id", await getStoreId())
      .gte("day", since)
      .order("hits", { ascending: false });
    return (data ?? []) as TrafficRow[];
  } catch {
    return [];
  }
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { isMetaId } from "@/lib/meta-id";

/**
 * Numeric Meta ids -> the names a human recognises.
 *
 * Most of this account's ads run Meta's default dynamic parameters, so
 * utm_campaign / utm_term / utm_content arrive as 18-digit ids. The ledger was
 * rendering those verbatim, which is how "no conversions are assigned to the
 * campaigns" looked from the ads team's side even when the sale was attributed.
 *
 * Two sources, in this order:
 *   - the `meta_ad_names` table, hand-seeded in migration 0082;
 *   - Meta's Graph API, for ids the table has never seen, but ONLY when
 *     META_ADS_TOKEN is set.
 *
 * The Conversions API token cannot do this: it carries `read_ads_dataset_quality`
 * alone and is refused on every ad object, including its own pixel. So a second
 * token is genuinely required, and until somebody issues one this module is the
 * table and nothing else — correct for the ids it knows, unchanged for the rest.
 */

const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; names: Record<string, string> } | null = null;

/** Everything the table knows, memoised briefly so one page render is one query. */
export async function metaNames(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.names;
  const names: Record<string, string> = {};
  try {
    const db = createServiceClient();
    const { data } = await db.from("meta_ad_names").select("id, name");
    for (const r of data ?? []) names[r.id as string] = r.name as string;
    cache = { at: Date.now(), names };
  } catch {
    // A lookup miss renders the id, which is what it did before this existed.
    // Never worth failing a page that reports money.
    return cache?.names ?? {};
  }
  return names;
}

/**
 * Names for these ids, fetching any the table has not seen.
 *
 * Call this where a page already knows which ids it is about to render. The
 * fetch is skipped entirely when every id is known, which is the steady state.
 */
export async function metaNamesFor(values: string[]): Promise<Record<string, string>> {
  const known = await metaNames();
  const missing = [...new Set(values.filter((v) => isMetaId(v) && !known[v.trim()]))];
  if (missing.length === 0) return known;

  const fetched = await fetchFromGraph(missing);
  if (Object.keys(fetched).length === 0) return known;

  // Written back so the next render is a table read, and so the names survive
  // the token being rotated away later.
  try {
    const db = createServiceClient();
    await db.from("meta_ad_names").upsert(
      Object.entries(fetched).map(([id, name]) => ({ id, name, kind: "ad" })),
      { onConflict: "id" },
    );
  } catch {
    // Cached in memory below regardless; the write is an optimisation.
  }

  const merged = { ...known, ...fetched };
  cache = { at: Date.now(), names: merged };
  return merged;
}

/**
 * Ask Meta what these ids are called.
 *
 * Returns nothing at all without META_ADS_TOKEN — which is the normal state
 * today, and the reason this never throws. A batch read: `?ids=a,b,c&fields=name`
 * is one request for up to 50 objects, so a page that renders twenty unknown ads
 * costs one call rather than twenty.
 */
async function fetchFromGraph(ids: string[]): Promise<Record<string, string>> {
  const token = process.env.META_ADS_TOKEN;
  if (!token) return {};
  const out: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/?ids=${batch.join(",")}&fields=name` +
          `&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) return out;
      const json = (await res.json()) as Record<string, { name?: string }>;
      for (const [id, v] of Object.entries(json)) {
        if (v && typeof v.name === "string" && v.name.trim()) out[id] = v.name.trim();
      }
    } catch {
      // A tracking-adjacent read must never take an admin page down.
      return out;
    }
  }
  return out;
}

/** Test seam: the module-level cache outlives a single test otherwise. */
export function resetMetaNameCache(): void {
  cache = null;
}

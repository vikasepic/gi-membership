import { biggestDrop, type DayPoint, type FunnelView } from "@/lib/traffic-funnel";

/**
 * The traffic screen as one list.
 *
 * Pure, and deliberately not `server-only`: the table component's test imports
 * it, and lib/traffic.ts (which is server-only) may not be pulled into jsdom.
 * Same split, and the same reason, as lib/traffic-funnel.ts.
 *
 * Every page is a row, funnel or not. A separate section for the pages with no
 * funnel is what hid /o/book-writer — the busiest page in the store — under
 * fourteen cards.
 */

export type OverviewRow = {
  /** The funnel this row drills into, or null for a page that owns none. */
  key: string | null;
  title: string;
  path: string;
  kind: "product" | "offer" | "other";
  /**
   * Four for a funnel; one (views) for anything else. Null means the step does
   * not exist for this page — an offer with no upsell configured — as opposed
   * to a measured zero.
   */
  steps: (number | null)[];
  drop: { to: number; percent: number } | null;
  daily: DayPoint[];
  topSource: { source: string; hits: number } | null;
};

export type Sort = "page" | "views" | "checkout" | "upsell" | "bought" | "drop" | "source";
export type Dir = "asc" | "desc";
export type Kind = "all" | "product" | "offer" | "other";

export type OverviewFilter = { kind: Kind; source: string; q: string; sort: Sort; dir: Dir };

/** The filter plus the preset, which is read and whitelisted separately (`presetFrom`, in
 *  `lib/traffic-funnel.ts`) but has to ride along on every link this screen and its
 *  drill-in build. */
export type LinkFilter = OverviewFilter & { preset: string };

const SORTS: readonly Sort[] = ["page", "views", "checkout", "upsell", "bought", "drop", "source"];
const KINDS: readonly Kind[] = ["all", "product", "offer", "other"];

const one = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;

/**
 * The filter off the URL.
 *
 * Whitelisted like every other admin filter: `sort` and `dir` select a
 * comparator, and an unrecognised value has to pick one rather than render
 * nothing. `q` and `source` are compared in memory, never interpolated into a
 * query.
 */
export function overviewFilterFrom(
  params: Record<string, string | string[] | undefined>,
): OverviewFilter {
  const sort = one(params.sort);
  const dir = one(params.dir);
  const kind = one(params.kind);
  return {
    kind: KINDS.includes(kind as Kind) ? (kind as Kind) : "all",
    source: (one(params.source) ?? "").trim(),
    q: (one(params.q) ?? "").trim(),
    sort: SORTS.includes(sort as Sort) ? (sort as Sort) : "views",
    dir: dir === "asc" ? "asc" : "desc",
  };
}

/**
 * A traffic URL for `path`, from the full filter state plus an override.
 *
 * Every link on this screen and its drill-in keeps the whole state: dropping
 * even the preset would silently change the window under the numbers being
 * sorted, and dropping a filter would silently change what a sorted link is
 * sorting. One helper, used by the table's row links, its own sort and kind
 * links, the preset tabs, and the drill-in's back link, so each cannot forget
 * a different field the way three of them once did.
 *
 * `path` is a parameter rather than a constant because the row link points at
 * `/admin/traffic/<key>`, not `/admin/traffic` — the only thing every caller
 * shares is the query string, not the base.
 */
export function trafficUrl(path: string, filter: LinkFilter, over: Partial<LinkFilter> = {}): string {
  const f = { ...filter, ...over };
  const q = new URLSearchParams();
  if (f.preset && f.preset !== "30") q.set("preset", f.preset);
  if (f.kind !== "all") q.set("kind", f.kind);
  if (f.source) q.set("source", f.source);
  if (f.q) q.set("q", f.q);
  if (f.sort !== "views") q.set("sort", f.sort);
  if (f.dir !== "desc") q.set("dir", f.dir);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

const pathOf = (kind: "product" | "offer", key: string) =>
  kind === "product" ? `/p/${key}` : `/o/${key}`;

export function overviewRows(view: FunnelView, ordersKnown = true): OverviewRow[] {
  const funnels: OverviewRow[] = view.funnels.map((f) => ({
    key: f.key,
    title: f.title,
    path: pathOf(f.kind, f.key),
    kind: f.kind,
    steps: f.steps.map((s) => s.count),
    // biggestDrop is correct for whatever steps it's given, but under a
    // source filter `f.steps[3]` isn't a measured zero, it's an absence:
    // orders carry no source anywhere in this store, so the caller forces
    // the fourth step to 0 rather than counting it (see page.tsx). Handed
    // that step anyway, biggestDrop would call the fall INTO it a
    // mathematically perfect "100% at the sale," which wins the sort over
    // every real leak in the one column whose job is finding the page that
    // actually leaks. Truncating to the three steps that ARE known is not an
    // optimisation — it's a statement that this filter cannot see the sale.
    drop: biggestDrop(ordersKnown ? f.steps : f.steps.slice(0, 3)),
    daily: f.daily,
    topSource: f.sources[0] ?? null,
  }));

  const others: OverviewRow[] = view.others.map((o) => ({
    key: null,
    title: o.path,
    path: o.path,
    kind: "other" as const,
    steps: [o.hits],
    drop: null,
    daily: [],
    topSource: o.sources[0] ?? null,
  }));

  return [...funnels, ...others];
}

/** Every source present, busiest first — the options for the select. */
export function sourcesIn(rows: OverviewRow[]): string[] {
  const total = new Map<string, number>();
  for (const r of rows) {
    if (!r.topSource) continue;
    total.set(r.topSource.source, (total.get(r.topSource.source) ?? 0) + r.topSource.hits);
  }
  return [...total.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s);
}

/** A step's count for sorting. An absent step sorts as nothing, like a zero. */
const at = (row: OverviewRow, i: number): number => row.steps[i] ?? 0;

export function applyOverview(rows: OverviewRow[], filter: OverviewFilter): OverviewRow[] {
  const q = filter.q.toLowerCase();
  const kept = rows.filter((r) => {
    if (filter.kind !== "all" && r.kind !== filter.kind) return false;
    // No `source` clause: the caller (app/admin/traffic/page.tsx) restricts
    // the raw counts to one source and reshapes the funnels from that alone
    // before `rows` ever reaches this function, so every row already IS that
    // source's data by construction. Re-filtering on `topSource` here would
    // be a second, different filter — the one that used to drop a page a
    // source drove but did not dominate.
    if (q && !`${r.title} ${r.path}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const sign = filter.dir === "asc" ? 1 : -1;
  return [...kept].sort((a, b) => {
    switch (filter.sort) {
      case "page":
        return sign * a.title.localeCompare(b.title);
      case "source":
        return sign * (a.topSource?.source ?? "").localeCompare(b.topSource?.source ?? "");
      case "drop": {
        // A page with no drop sorts LAST whichever way the column is pointed:
        // "nothing to lose" is not the answer to "what is leaking worst", and
        // it is not the answer to "what is leaking least" either.
        if (!a.drop && !b.drop) return a.title.localeCompare(b.title);
        if (!a.drop) return 1;
        if (!b.drop) return -1;
        return sign * (a.drop.percent - b.drop.percent) || a.title.localeCompare(b.title);
      }
      default: {
        const i = { views: 0, checkout: 1, upsell: 2, bought: 3 }[filter.sort]!;
        return sign * (at(a, i) - at(b, i)) || a.title.localeCompare(b.title);
      }
    }
  });
}

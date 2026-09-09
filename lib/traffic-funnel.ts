/**
 * Turning counted rows into a funnel.
 *
 * Pure input to output: no database, no request, no `server-only`. That is
 * deliberate — `lib/traffic.ts` starts with `import "server-only"` and a jsdom
 * component test that reaches it throws, so the components import their types
 * and their arithmetic from here instead. The row types are declared twice
 * for the same reason; three record types are cheaper than the coupling.
 *
 * The honest limit, which the page must repeat out loud: the first three steps
 * are VIEWS. One person reloading the sales page twice is two of them. The
 * fourth step is orders and is people. So the drop between them is a
 * direction, never a conversion rate.
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

export type SourceSplit = { source: string; hits: number };
export type DayPoint = { day: string; hits: number };
export type FunnelStep = { label: string; count: number };

export type ProductFunnel = {
  slug: string;
  title: string;
  steps: FunnelStep[];
  sources: SourceSplit[];
  daily: DayPoint[];
  /** Sales-page views, which is what the cards are ordered by. */
  salesViews: number;
};

export type OtherPage = { path: string; hits: number; sources: SourceSplit[] };

export type FunnelView = {
  products: ProductFunnel[];
  others: OtherPage[];
  /** Every counted view in the window, funnel or not. */
  counted: number;
};

const STEP_LABELS = ["Saw the sales page", "Reached the checkout", "Saw the upsell", "Bought"];

/**
 * One number format for the whole page.
 *
 * It lives here rather than in a component because two files render figures
 * onto the same screen, and when only one of them had it the cards read
 * `12,340` directly under a note reading `12340`.
 */
export const formatCount = (v: number): string => v.toLocaleString("en-US");

/** Sorted busiest first, which is the only order anybody reads a split in. */
function splitOf(m: Map<string, number>): SourceSplit[] {
  return [...m.entries()]
    .map(([source, hits]) => ({ source, hits }))
    .sort((a, b) => b.hits - a.hits);
}

function add(m: Map<string, number>, k: string, n: number): void {
  m.set(k, (m.get(k) ?? 0) + n);
}

/**
 * Every product with something to show, and every row that belonged to none.
 *
 * A card exists for a slug only if that slug names a real product. That is
 * what keeps offer keys — `/o/<key>` writes its key as the product — and the
 * slugs of deleted products from inventing funnels; they fall through to
 * `others` with everything else nothing consumed.
 */
export function buildFunnels(
  counts: CountRow[],
  bought: BoughtRow[],
  names: ProductName[],
  days: string[],
): FunnelView {
  const titleOf = new Map(names.map((n) => [n.slug, n.title]));
  const boughtOf = new Map(bought.map((b) => [b.product, b.orders]));

  const sales = new Map<string, number>();
  const checkout = new Map<string, number>();
  const upsell = new Map<string, number>();
  const sources = new Map<string, Map<string, number>>();
  const daily = new Map<string, Map<string, number>>();
  const others = new Map<string, { hits: number; sources: Map<string, number> }>();

  let counted = 0;

  const per = <T>(m: Map<string, T>, k: string, make: () => T): T => {
    const v = m.get(k) ?? make();
    m.set(k, v);
    return v;
  };

  for (const r of counts) {
    counted += r.hits;

    // A sales page names its product in the path; the other two carry it in
    // the column. Either way it only counts if it is a product we have.
    const salesSlug = r.path.startsWith("/p/") ? r.path.slice(3) : null;
    const slug = salesSlug ?? r.product;
    const known = titleOf.has(slug);

    if (known && salesSlug) {
      add(sales, slug, r.hits);
      add(per(sources, slug, () => new Map()), r.source, r.hits);
      add(per(daily, slug, () => new Map()), r.day, r.hits);
      continue;
    }
    if (known && r.path === "/checkout") {
      add(checkout, slug, r.hits);
      continue;
    }
    if (known && r.path === "/checkout/oto") {
      add(upsell, slug, r.hits);
      continue;
    }

    // Nothing claimed it. Offer pages, the store home, a deleted product's
    // page, and the checkout rows counted before the product column existed
    // — all real views, so all shown rather than quietly dropped.
    const o = per(others, r.path, () => ({ hits: 0, sources: new Map<string, number>() }));
    o.hits += r.hits;
    add(o.sources, r.source, r.hits);
  }

  const slugs = new Set<string>([
    ...sales.keys(),
    ...checkout.keys(),
    ...upsell.keys(),
    ...[...boughtOf.keys()].filter((s) => titleOf.has(s)),
  ]);

  const products: ProductFunnel[] = [...slugs]
    .map((slug) => {
      const byDay = daily.get(slug) ?? new Map<string, number>();
      return {
        slug,
        title: titleOf.get(slug) ?? slug,
        steps: [
          sales.get(slug) ?? 0,
          checkout.get(slug) ?? 0,
          upsell.get(slug) ?? 0,
          boughtOf.get(slug) ?? 0,
        ].map((count, i) => ({ label: STEP_LABELS[i], count })),
        sources: splitOf(sources.get(slug) ?? new Map()),
        // Dense: a line that skips the quiet days draws a plateau where there
        // was a gap.
        daily: days.map((day) => ({ day, hits: byDay.get(day) ?? 0 })),
        salesViews: sales.get(slug) ?? 0,
      };
    })
    .sort((a, b) => b.salesViews - a.salesViews || a.slug.localeCompare(b.slug));

  return {
    products,
    others: [...others.entries()]
      .map(([path, o]) => ({ path, hits: o.hits, sources: splitOf(o.sources) }))
      .sort((a, b) => b.hits - a.hits),
    counted,
  };
}

/**
 * The polyline for a sparkline, or nothing.
 *
 * Nothing when fewer than two days carry a hit: one point drawn as a line
 * asserts a trend that a single day cannot support, and an empty chart is a
 * more honest answer than a confident wrong one. That guard is also what makes
 * `peak` safe to divide by — it cannot be zero once two days have hits.
 *
 * Normalised against the peak, so the line describes shape and never
 * magnitude: a flat week at four a day and a flat week at four hundred draw
 * the same line. The figure printed beside it is not decoration.
 */
export function sparklinePath(daily: DayPoint[], width: number, height: number): string | null {
  if (daily.filter((d) => d.hits > 0).length < 2) return null;
  const peak = Math.max(...daily.map((d) => d.hits));
  const step = width / (daily.length - 1);
  return daily
    .map((d, i) => `${Math.round(i * step)},${Math.round(height - (d.hits / peak) * height)}`)
    .join(" ");
}

/**
 * A window, as two inclusive UTC calendar days.
 *
 * It used to be a day count. "Last month" is not a count of days back, and
 * neither is "this month", so the count could not express them — every reader
 * takes the pair now. Inclusive at both ends: `page_counts.day` is a date, and
 * a half-open range on dates reads as an off-by-one to everybody who maintains
 * it later.
 */
export type DayRange = { start: string; end: string };

const DAY_MS = 86_400_000;

/** UTC midnight of an ISO date, as epoch ms. */
function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** An epoch ms back to an ISO date. */
function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
] as const;

export type Preset = (typeof PRESETS)[number]["key"];

const DEFAULT_PRESET: Preset = "30";

/**
 * The preset off the URL, refusing anything not on the list.
 *
 * A whitelist rather than a parse: the value becomes a date bound on a query,
 * and an unbounded one here would be a request for the whole table.
 */
export function presetFrom(params: Record<string, string | string[] | undefined>): Preset {
  const raw = params.preset;
  const one = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  return PRESETS.some((p) => p.key === one) ? (one as Preset) : DEFAULT_PRESET;
}

/**
 * What a preset covers, on a given UTC day.
 *
 * `today` is a parameter rather than a clock read for the reason every reader
 * in lib/traffic.ts gives: one page render resolves a range once and hands the
 * same pair to four queries and a chart, and a request that crosses UTC
 * midnight between two clock reads gets a chart a day short of its own totals.
 */
export function rangeOf(preset: Preset, today: string): DayRange {
  const end = dayMs(today);
  const back = (n: number) => isoDay(end - n * DAY_MS);
  const firstOfMonth = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;

  switch (preset) {
    case "today":
      return { start: today, end: today };
    case "yesterday":
      return { start: back(1), end: back(1) };
    case "7":
    case "30":
    case "90":
      // Counting back INCLUDES today, so "7 days" is six days back plus today.
      return { start: back(Number(preset) - 1), end: today };
    case "this-month":
      return { start: firstOfMonth(new Date(end)), end: today };
    case "last-month": {
      const firstThis = dayMs(firstOfMonth(new Date(end)));
      const lastPrev = firstThis - DAY_MS;
      return { start: firstOfMonth(new Date(lastPrev)), end: isoDay(lastPrev) };
    }
  }
}

/** Every ISO day in the window, oldest first, both ends included. */
export function daysInRange(range: DayRange): string[] {
  const start = dayMs(range.start);
  const end = dayMs(range.end);
  if (end < start) return [];
  const n = Math.round((end - start) / DAY_MS) + 1;
  return Array.from({ length: n }, (_, i) => isoDay(start + i * DAY_MS));
}

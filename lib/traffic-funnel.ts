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

/** Every ISO date in the window, oldest first, ending on `today`. */
export function daysInRange(days: number, today: string): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) =>
    new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
  );
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

const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

/**
 * The range off the URL, refusing anything not on the list.
 *
 * It reaches a query, so it is a whitelist rather than a parse: an unbounded
 * number here would be a request for the whole table.
 */
export function rangeFrom(params: Record<string, string | string[] | undefined>): Range {
  const raw = params.range;
  const one = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const n = Number(one);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : 30;
}

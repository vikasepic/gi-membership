import type { TrafficRow } from "@/lib/traffic";

/**
 * What actually happened on the site.
 *
 * Counted on the server, so this includes the traffic the pixel and GA4 never
 * see — consent declined, scripts blocked, gone before hydration. It will
 * read HIGHER than either of them, and that difference is the point rather
 * than a discrepancy to reconcile.
 *
 * Presentational only, and split out from the page component: the page
 * imports `lib/traffic.ts`, which starts with `import "server-only"`, and a
 * jsdom test importing that module throws. This file imports only the
 * `TrafficRow` type from it, which is erased at compile time.
 */
export function TrafficTable({ rows }: { rows: TrafficRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted">
        No traffic counted yet. Views appear here as soon as somebody opens a sales page.
      </p>
    );
  }

  const byPath = new Map<string, { total: number; sources: Map<string, number> }>();
  for (const r of rows) {
    const entry = byPath.get(r.path) ?? { total: 0, sources: new Map() };
    entry.total += r.hits;
    entry.sources.set(r.source, (entry.sources.get(r.source) ?? 0) + r.hits);
    byPath.set(r.path, entry);
  }
  const pages = [...byPath.entries()].sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="flex flex-col gap-3">
      {pages.map(([path, entry]) => (
        <div key={path} className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium">{path}</span>
            <span className="font-display text-2xl tabular-nums">{entry.total}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            {[...entry.sources.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([source, hits]) => (
                <span key={source}>
                  {source} <span className="tabular-nums text-fg">{hits}</span>
                </span>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The gap between what happened and what the ad tools saw.
 *
 * The spec's reason for having two layers. Stated as a share rather than two
 * bare numbers, because "31% of your traffic is invisible to Meta" is a
 * sentence somebody can act on and "412 and 284" is not.
 */
export function CoverageNote({ counted, consented }: { counted: number; consented: number }) {
  if (counted === 0) return null;
  const missed = Math.max(0, counted - consented);
  const pct = Math.round((missed / counted) * 100);
  return (
    <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
      <span className="font-medium text-fg">{counted}</span> views counted here.{" "}
      <span className="font-medium text-fg">{consented}</span> visitors accepted cookies, so
      roughly <span className="font-medium text-fg">{pct}%</span> of this traffic is invisible to
      your pixel and to GA4. That gap is why this page exists.
    </p>
  );
}

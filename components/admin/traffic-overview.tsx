import Link from "next/link";
import { formatCount } from "@/lib/traffic-funnel";
import { Sparkline } from "@/components/admin/traffic-funnel";
import { trafficUrl, type LinkFilter, type OverviewRow, type Sort } from "@/lib/traffic-overview";

const STEP_AT = ["the sales page", "the checkout", "the upsell", "the sale"];

const COLUMNS: { key: Sort; label: string; right?: boolean }[] = [
  { key: "page", label: "Page" },
  { key: "views", label: "Views", right: true },
  { key: "checkout", label: "Checkout", right: true },
  { key: "upsell", label: "Upsell", right: true },
  { key: "bought", label: "Bought", right: true },
  { key: "drop", label: "Biggest drop" },
  { key: "source", label: "Top source" },
];

const KINDS = [
  { key: "all", label: "All" },
  { key: "product", label: "Products" },
  { key: "offer", label: "Offers" },
  { key: "other", label: "Other" },
] as const;

export function TrafficOverview({
  rows,
  filter,
  sources,
}: {
  rows: OverviewRow[];
  /** Carries the preset too, so a sorted link keeps the window. */
  filter: LinkFilter;
  sources: string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <Link
            key={k.key}
            href={trafficUrl("/admin/traffic", filter, { kind: k.key })}
            aria-current={filter.kind === k.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter.kind === k.key
                ? "border-primary bg-primary/10 font-medium text-primary"
                : "border-border text-muted hover:border-fg hover:text-fg"
            }`}
          >
            {k.label}
          </Link>
        ))}

        <form action="/admin/traffic" className="ml-auto flex flex-wrap items-center gap-2">
          <input type="hidden" name="preset" value={filter.preset} />
          <input type="hidden" name="sort" value={filter.sort} />
          <input type="hidden" name="dir" value={filter.dir} />
          {filter.kind !== "all" && <input type="hidden" name="kind" value={filter.kind} />}
          <input
            name="q"
            defaultValue={filter.q}
            placeholder="Search pages"
            aria-label="Search pages"
            className="w-44 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs outline-none focus:border-primary"
          />
          <select
            name="source"
            defaultValue={filter.source}
            aria-label="Source"
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
          >
            <option value="">Every source</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:border-fg"
          >
            Apply
          </button>
        </form>
      </div>

      {filter.source && (
        <p className="text-xs text-muted">
          Showing views and orders from <span className="font-medium text-fg">{filter.source}</span>.
          Orders are bucketed the way views are — by campaign name, else by source — so Bought is
          this source&rsquo;s own sales.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-border text-muted">
            <tr>
              {COLUMNS.map((c) => {
                const active = filter.sort === c.key;
                const dir = active && filter.dir === "desc" ? "asc" : "desc";
                return (
                  <th key={c.key} className={`px-4 py-3 font-medium ${c.right ? "text-right" : ""}`}>
                    <Link
                      href={trafficUrl("/admin/traffic", filter, { sort: c.key, dir })}
                      aria-current={active ? "page" : undefined}
                      className={active ? "text-fg" : "hover:text-fg"}
                    >
                      {c.label}
                      {active && <span aria-hidden>{filter.dir === "desc" ? " ↓" : " ↑"}</span>}
                    </Link>
                  </th>
                );
              })}
              <th className="px-4 py-3 font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.path} className="border-b border-border/60 last:border-b-0">
                <td className="px-4 py-3">
                  {r.key ? (
                    // Carries the whole state, same as every other link here:
                    // a row clicked from a 7-day, offers-only, drop-sorted
                    // table must not land on an unfiltered 30-day funnel.
                    <Link
                      href={trafficUrl(`/admin/traffic/${r.key}`, filter)}
                      className="font-medium hover:underline"
                    >
                      {r.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.title}</span>
                  )}
                  <span className="block text-xs text-muted">{r.path}</span>
                </td>
                {[0, 1, 2, 3].map((i) => {
                  // An em dash means "this page has no such step" — a row with
                  // no funnel, or an owner with no upsell. Never a zero, which
                  // is a measurement.
                  const blank = r.kind === "other" ? i > 0 : r.steps[i] === null;
                  return (
                    <td key={i} className="px-4 py-3 text-right tabular-nums">
                      {blank ? (
                        <span className="text-muted">—</span>
                      ) : (
                        formatCount(r.steps[i] ?? 0)
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-sm">
                  {r.drop ? (
                    <span className="text-primary">
                      {r.drop.percent}% at {STEP_AT[r.drop.to]}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted">
                  {r.topSource ? `${r.topSource.source} ${formatCount(r.topSource.hits)}` : "—"}
                </td>
                <td className="px-4 py-3">
                  {r.daily.length > 1 ? <Sparkline daily={r.daily} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

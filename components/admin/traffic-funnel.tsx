import Link from "next/link";
import { sparklinePath, type DayPoint, type OtherPage, type ProductFunnel, type Range } from "@/lib/traffic-funnel";

/**
 * The traffic page's furniture.
 *
 * Types and arithmetic come from `lib/traffic-funnel.ts`, never from
 * `lib/traffic.ts` — that one starts with `import "server-only"` and a jsdom
 * component test that reaches it throws.
 *
 * Everything here is a server component. No `"use client"`, no chart library:
 * the only chart is a polyline whose geometry `sparklinePath` computes.
 */

const RANGES: Range[] = [7, 30, 90];

const n = (v: number) => v.toLocaleString("en-US");

/** The sparkline's box. The same numbers go to `sparklinePath`, so the path fits. */
const SPARK_W = 132;
const SPARK_H = 28;

/**
 * A shape for the last fortnight of a product, or nothing.
 *
 * Nothing is the point: below two days with hits `sparklinePath` returns null
 * and this returns null with it, so the card shows no chart rather than an
 * empty frame or a flat line — either would assert a trend the data cannot
 * support. The line is normalised against its own peak, so it describes shape
 * and not size; the figure printed next to it carries the magnitude.
 */
export function Sparkline({ daily }: { daily: DayPoint[] }) {
  const points = sparklinePath(daily, SPARK_W, SPARK_H);
  if (!points) return null;
  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      width={SPARK_W}
      height={SPARK_H}
      aria-hidden="true"
      className="overflow-visible text-primary"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * One product, top to bottom.
 *
 * A bar chart lying on its side rather than a tapering funnel: length from a
 * common zero is the encoding people compare accurately, and a trapezoid whose
 * width is not proportional to the loss flatters the middle of the funnel.
 * Every step renders, zeros included — a product with views and no sales is
 * the answer somebody came here for, and a card that drops the row reads as
 * three stages.
 *
 * Each step also says what it counts. The page states the caveat once at the
 * top; the row-level unit is what stops somebody reading four numbers of the
 * same kind when the last one is a different kind.
 */
export function FunnelCard({ product }: { product: ProductFunnel }) {
  const steps = product.steps;
  // Not steps[0]: an order can arrive against a product whose sales page was
  // never viewed in the window, and dividing by that zero would hide it.
  const top = Math.max(...steps.map((s) => s.count), 0);
  const peak = Math.max(...product.daily.map((d) => d.hits), 0);
  const totalSources = product.sources.reduce((sum, s) => sum + s.hits, 0);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg leading-tight">{product.title}</h2>
          <span className="text-xs text-muted">/p/{product.slug}</span>
        </div>
        {/* The line has no axis, so the number beside it is the scale. */}
        <div className="flex items-center gap-3">
          <Sparkline daily={product.daily} />
          {peak > 0 && (
            <span className="whitespace-nowrap text-xs text-muted">
              busiest day <span className="tabular-nums text-fg">{n(peak)}</span>
            </span>
          )}
        </div>
      </div>

      <ol className="flex flex-col">
        {steps.map((step, i) => {
          const prev = i > 0 ? steps[i - 1].count : null;
          const last = i === steps.length - 1;
          // A hairline for a non-zero step that would otherwise round to
          // nothing, so "small" never draws the same as "none".
          const width = top > 0 && step.count > 0 ? Math.max(1.5, (step.count / top) * 100) : 0;
          return (
            <li key={step.label} className="flex flex-col">
              {prev !== null && <Drop from={prev} to={step.count} />}
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm text-fg">{step.label}</span>
                  <div className="h-1.5 w-full rounded-full bg-surface-2">
                    <div
                      className={`h-1.5 rounded-full ${last ? "bg-primary" : "bg-primary/40"}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
                <div className="flex w-24 shrink-0 flex-col items-end">
                  <span className="font-display text-lg leading-none tabular-nums">{n(step.count)}</span>
                  <span className="text-[0.65rem] text-muted">{last ? "people" : "views"}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-xs text-muted">
        <span className="kicker">Came from</span>
        {product.sources.length === 0 ? (
          <span>nothing recorded a source in this window.</span>
        ) : (
          product.sources.map((s) => (
            <span
              key={s.source}
              className="rounded-full border border-border px-2 py-0.5 text-[0.7rem]"
            >
              {s.source} <span className="tabular-nums text-fg">{n(s.hits)}</span>
            </span>
          ))
        )}
        {totalSources > 0 && (
          <span className="ml-auto">sales-page views only</span>
        )}
      </div>
    </section>
  );
}

/**
 * The gap between two steps, said in both counts and share.
 *
 * The share alone hides that 2 of 3 is 67%; the count alone hides that 300 of
 * 40,000 is nothing. Going up is possible and real — the checkout is reachable
 * from an offer page that never touched the sales page — so it is stated
 * rather than shown as a negative drop.
 */
function Drop({ from, to }: { from: number; to: number }) {
  if (from === 0) return <div className="h-3" />;
  const lost = from - to;
  return (
    <div className="flex items-center gap-2 py-1 pl-0.5 text-[0.7rem] text-muted">
      <span aria-hidden="true">↓</span>
      <span className="tabular-nums">
        {lost > 0
          ? `${n(lost)} fewer · ${Math.round((lost / from) * 100)}% drop`
          : lost === 0
            ? "no drop"
            : `${n(-lost)} more than the step above`}
      </span>
    </div>
  );
}

/**
 * The window, as three links.
 *
 * Links and not buttons: the range lives in the URL, so a view can be sent to
 * somebody, kept in a tab, and walked back with the back button.
 */
export function RangeTabs({ range }: { range: Range }) {
  return (
    <nav aria-label="Date range" className="flex items-center gap-2">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`/admin/traffic?range=${r}`}
          aria-current={r === range ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-xs tabular-nums transition-colors ${
            r === range
              ? "border-primary bg-primary/10 font-medium text-primary"
              : "border-border text-muted hover:border-fg hover:text-fg"
          }`}
        >
          {r} days
        </Link>
      ))}
    </nav>
  );
}

/**
 * Everything no funnel claimed.
 *
 * Deliberately not a card: a bare list under a rule, because these are pages
 * with a view count and nothing else — no steps, no orders, no funnel. Giving
 * them the same chrome as a product would imply a comparison that does not
 * exist. Nothing at all when there are none.
 */
export function OtherPages({ pages }: { pages: OtherPage[] }) {
  if (pages.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <div className="flex flex-col gap-0.5">
        <h2 className="kicker text-muted">Other pages</h2>
        <p className="text-sm text-muted">
          Views outside any product funnel — offer pages, the storefront, and pages counted before
          they carried a product. Totals only; there are no steps behind these.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {pages.map((p) => (
          <li key={p.path} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
            <span className="text-sm text-fg">{p.path}</span>
            <span className="flex flex-wrap gap-x-2 text-xs text-muted">
              {p.sources.map((s) => (
                <span key={s.source}>
                  {s.source} <span className="tabular-nums">{n(s.hits)}</span>
                </span>
              ))}
            </span>
            <span className="ml-auto font-display text-sm tabular-nums">{n(p.hits)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

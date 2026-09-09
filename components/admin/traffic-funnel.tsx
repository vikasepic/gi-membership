import Link from "next/link";
import { formatCount as n, sparklinePath, type DayPoint, type Funnel, PRESETS } from "@/lib/traffic-funnel";
import { trafficUrl, type LinkFilter } from "@/lib/traffic-overview";

/**
 * The traffic page's furniture.
 *
 * Types and arithmetic come from `lib/traffic-funnel.ts`, and link-building
 * from `lib/traffic-overview.ts` — never from `lib/traffic.ts`, which starts
 * with `import "server-only"` and a jsdom component test that reaches it
 * throws. Neither of the other two carries that import, which is why
 * `PresetTabs` can build a URL through the same `trafficUrl` the table uses.
 *
 * Everything here is a server component. No `"use client"`, no chart library:
 * the only chart is a polyline whose geometry `sparklinePath` computes.
 */

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
export function FunnelCard({ funnel }: { funnel: Funnel }) {
  const steps = funnel.steps;
  // Not steps[0]: an order can arrive against a product whose sales page was
  // never viewed in the window, and dividing by that zero would hide it.
  const top = Math.max(...steps.map((s) => s.count), 0);
  const peak = Math.max(...funnel.daily.map((d) => d.hits), 0);
  const totalSources = funnel.sources.reduce((sum, s) => sum + s.hits, 0);
  // An offer's real page is /o/<key>, a product's is /p/<slug> — this card
  // is shared by both, so the prefix has to follow the owner's kind rather
  // than assume "/p/".
  const pathPrefix = funnel.kind === "offer" ? "/o/" : "/p/";

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg leading-tight">{funnel.title}</h2>
          <span className="text-xs text-muted">{pathPrefix}{funnel.key}</span>
        </div>
        {/* The line has no axis, so the number beside it is the scale. */}
        <div className="flex items-center gap-3">
          <Sparkline daily={funnel.daily} />
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
              {/*
                No share on the last one: it is views above and people below,
                and a percentage between two different units is a conversion
                rate this page cannot compute. The other two are views to
                views and keep theirs.
              */}
              {prev !== null && <Drop from={prev} to={step.count} share={!last} />}
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
        {funnel.sources.length === 0 ? (
          <span>nothing recorded a source in this window.</span>
        ) : (
          funnel.sources.map((s) => (
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
 *
 * `share` is off where the two steps count different things. The page says in
 * words that views are not people; this is the one place a number would say
 * otherwise, and the number is what somebody quotes.
 */
function Drop({ from, to, share }: { from: number; to: number; share: boolean }) {
  if (from === 0) return <div className="h-3" />;
  const lost = from - to;
  return (
    <div className="flex items-center gap-2 py-1 pl-0.5 text-[0.7rem] text-muted">
      <span aria-hidden="true">↓</span>
      <span className="tabular-nums">
        {lost > 0
          ? share
            ? `${n(lost)} fewer · ${Math.round((lost / from) * 100)}% drop`
            : `${n(lost)} fewer`
          : lost === 0
            ? "no drop"
            : `${n(-lost)} more than the step above`}
      </span>
    </div>
  );
}

/**
 * The window, as a row of links.
 *
 * Links and not buttons: the range lives in the URL, so a view can be sent to
 * somebody, kept in a tab, and walked back with the back button.
 *
 * Takes the whole filter, not just the preset it switches: a tab that only
 * knew the preset had to build its `href` from that one field, which is
 * exactly what silently cleared the sort, the type chip, the source filter
 * and the search box on every window change — this is the page's most-used
 * control, so that was the most-hit version of the bug `trafficUrl` exists to
 * close.
 */
export function PresetTabs({ filter }: { filter: LinkFilter }) {
  return (
    <nav aria-label="Date range" className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => (
        <Link
          key={p.key}
          href={trafficUrl("/admin/traffic", filter, { preset: p.key })}
          aria-current={p.key === filter.preset ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            p.key === filter.preset
              ? "border-primary bg-primary/10 font-medium text-primary"
              : "border-border text-muted hover:border-fg hover:text-fg"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

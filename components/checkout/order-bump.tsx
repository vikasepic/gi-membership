"use client";

import { useId } from "react";
import { tint, type BumpView } from "@/lib/bump";

// The order bump, as a buyer sees it.
//
// Rendered by the checkout AND by the admin preview. A preview built from a
// separate mock is worse than no preview at all — it goes stale the first time
// one side changes, and nobody notices until a buyer sees something the admin
// never approved.
//
// Purely presentational: it is handed a view built by buildBumpView and owns no
// pricing logic of its own.

function Check({ className = "", color }: { className?: string; color?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      style={color ? { color } : undefined}
      className={`size-[15px] shrink-0 ${className}`}
    >
      <path
        d="M4 10.5l4 4 8-9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function OrderBump({
  view,
  checked,
  onChange,
  /** Tighter spacing for the admin preview pane. */
  compact = false,
}: {
  view: BumpView;
  checked: boolean;
  onChange: (next: boolean) => void;
  compact?: boolean;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  const { accent, ink } = view;

  return (
    <div
      // @container, not viewport breakpoints: this sits in a ~270px order
      // summary on a wide screen and a full-width column on a phone, so `sm:`
      // would widen the layout exactly where there is least room.
      className="@container overflow-hidden rounded-2xl border-2 bg-surface transition-shadow duration-200"
      style={{
        borderColor: accent,
        boxShadow: checked ? `0 0 0 4px ${tint(accent, 0.18)}` : undefined,
      }}
    >
      {view.banner && (
        <div
          className={`flex items-center justify-between gap-3 ${compact ? "px-3 py-1.5" : "px-4 py-2.5"}`}
          style={{ background: accent, color: ink }}
        >
          <span
            className={`font-display font-semibold uppercase tracking-[0.08em] ${
              compact ? "text-[0.68rem]" : "text-[0.8rem]"
            }`}
          >
            {view.banner}
          </span>
          {view.saveBadge && (
            <span
              className={`whitespace-nowrap rounded-full px-2.5 py-0.5 font-display font-semibold ${
                compact ? "text-[0.63rem]" : "text-[0.72rem]"
              }`}
              // Tinted from the ink rather than a fixed black, so the badge
              // stays visible on a pale accent where the ink is dark.
              style={{ background: tint(ink === "#ffffff" ? "#000000" : "#ffffff", 0.22) }}
            >
              {view.saveBadge}
            </span>
          )}
        </div>
      )}

      <div className={`flex items-start gap-3 ${compact ? "p-3" : "p-4"}`}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={view.description ? descId : undefined}
          className="mt-0.5 size-[22px] shrink-0 cursor-pointer rounded-md border-2 border-border bg-surface accent-transparent"
          style={
            checked
              ? { backgroundColor: accent, borderColor: accent, accentColor: accent }
              : { accentColor: accent }
          }
        />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {/* Side-by-side only at @md (448px). Measured: the live order summary
              renders this card at 329px, where a row leaves the headline ~180px
              and wraps it to six lines. */}
          <div className="flex flex-col gap-1 @md:flex-row @md:items-start @md:justify-between @md:gap-4">
            <label
              htmlFor={id}
              className={`min-w-0 cursor-pointer text-balance font-display font-semibold leading-snug ${
                compact ? "text-[0.98rem]" : "text-[1.05rem] @md:text-[1.15rem]"
              }`}
            >
              {view.headline}
            </label>

            {/* Narrow: was and now sit on one line under the headline. Wide:
                they stack in a right-aligned column beside it. Capped rather
                than shrink-0 — an uncapped column pushed the terms line out
                over the headline. */}
            <span className="flex flex-wrap items-baseline gap-x-2 tabular-nums @md:max-w-[46%] @md:flex-col @md:items-end @md:gap-x-0 @md:text-right">
              {view.wasLabel && (
                <span
                  className={`text-muted line-through ${compact ? "text-[0.75rem]" : "text-sm"}`}
                >
                  {view.wasLabel}
                </span>
              )}
              <span
                className={`font-display font-semibold leading-none ${
                  compact ? "text-[1.15rem]" : "text-[1.4rem] @md:text-[1.55rem]"
                }`}
                style={{ color: accent }}
              >
                {view.nowLabel}
              </span>
              {view.termsLabel && (
                <span className="w-full text-[0.75rem] leading-snug text-muted @md:mt-0.5 @md:w-auto">
                  {view.termsLabel}
                </span>
              )}
            </span>
          </div>

          {view.description && (
            <p id={descId} className={`text-muted ${compact ? "text-[0.8rem]" : "text-[0.92rem]"}`}>
              {view.description}
            </p>
          )}

          {view.bullets.length > 0 && (
            <ul
              className={`grid list-none grid-cols-1 gap-x-4 gap-y-1 p-0 @lg:grid-cols-2 ${
                compact ? "text-[0.78rem]" : "text-[0.89rem]"
              }`}
            >
              {view.bullets.map((b) => (
                <li key={b} className="flex items-start gap-1.5">
                  <Check className="mt-[3px]" color={accent} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {view.note && (
            <p
              className={`flex items-start gap-2 rounded-xl px-3 py-2.5 ${
                compact ? "text-[0.78rem]" : "text-[0.88rem]"
              }`}
              style={{ background: tint(accent, 0.09), border: `1px solid ${tint(accent, 0.26)}` }}
            >
              {view.note}
            </p>
          )}
        </div>
      </div>

      {checked && (
        <div
          className={`flex items-center gap-2 font-display font-semibold ${
            compact ? "px-3 py-1.5 text-[0.72rem]" : "px-4 py-2.5 text-[0.82rem]"
          }`}
          style={{ background: accent, color: ink }}
        >
          <Check />
          <span>
            {view.chargeNowCents === 0
              ? "Added — you will not be charged for this today"
              : "Added to your order"}
          </span>
        </div>
      )}
    </div>
  );
}

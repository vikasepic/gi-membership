"use client";

import { useId } from "react";
import { tint, type BumpChoice, type BumpView } from "@/lib/bump";

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
  alt = null,
  choice,
  onChoose,
  /** Tighter spacing for the admin preview pane. */
  compact = false,
}: {
  view: BumpView;
  /**
   * A second billing option for the same thing — monthly beside yearly.
   *
   * With one price a tickbox is the right control: there is a single thing to
   * say yes to. With two, ticking is not enough, so the card grows a radio
   * group and "No thanks" becomes an option someone has to be able to get back
   * to — a radio cannot be unticked by clicking it again.
   */
  alt?: BumpView | null;
  /** null while nobody has answered — nothing is selected and nothing is implied. */
  choice: BumpChoice | null;
  onChoose: (next: BumpChoice) => void;
  compact?: boolean;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  const { accent, ink } = view;
  const checked = choice !== "none" && choice !== null;

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
        {!alt && (
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChoose(e.target.checked ? "main" : "none")}
            aria-describedby={view.description ? descId : undefined}
            className="mt-0.5 size-[22px] shrink-0 cursor-pointer rounded-md border-2 border-border bg-surface accent-transparent"
            style={
              checked
                ? { backgroundColor: accent, borderColor: accent, accentColor: accent }
                : { accentColor: accent }
            }
          />
        )}

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
                over the headline.

                Hidden when there are two prices: each option carries its own
                below, and a third figure up here would be a price nobody chose. */}
            <span className={`flex flex-wrap items-baseline gap-x-2 tabular-nums @md:max-w-[46%] @md:flex-col @md:items-end @md:gap-x-0 @md:text-right ${alt ? "hidden" : ""}`}>
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

          {alt && (
            <fieldset className="flex flex-col gap-1.5 border-0 p-0">
              <legend className="sr-only">{view.headline} — choose how you pay</legend>
              <Option
                name={id}
                // The plan price, not the charge-now one: through a trial both
                // options are $0 today, and a choice between two $0s is not a
                // choice anyone can make.
                label={view.planLabel ?? view.nowLabel}
                terms={optionTerms(view)}
                was={view.wasLabel}
                badge={view.saveBadge}
                selected={choice === "main"}
                accent={accent}
                compact={compact}
                onSelect={() => onChoose("main")}
              />
              <Option
                name={id}
                label={alt.planLabel ?? alt.nowLabel}
                terms={optionTerms(alt)}
                was={alt.wasLabel}
                badge={alt.saveBadge}
                selected={choice === "alt"}
                accent={accent}
                compact={compact}
                onSelect={() => onChoose("alt")}
              />
              {/* Last, and nothing is selected until someone does. A decline
                  offered first is offered before the reason to accept, and a
                  decline pre-selected is one the buyer never actually made. */}
              <Option
                name={id}
                label="No thanks"
                selected={choice === "none"}
                accent={accent}
                compact={compact}
                onSelect={() => onChoose("none")}
              />
            </fieldset>
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

/**
 * The small print under one option.
 *
 * `termsLabel` reads "then $29/month, cancel any time" — right beneath a
 * headline price, and a repetition beside a radio that already says $29/month.
 * What is worth saying there is what happens today.
 */
function optionTerms(v: BumpView): string | null {
  if (v.chargeNowCents === 0) return "nothing today, cancel any time";
  return v.planLabel ? `${v.nowLabel} today` : null;
}

/**
 * One line of the choice: a radio, what it costs, and on what terms.
 *
 * The whole row is the label, so the hit area is the row rather than a 16px
 * circle — this card is often 330px wide on a phone, in the middle of a
 * checkout, and a miss there costs the sale rather than a click.
 */
function Option({
  name,
  label,
  terms,
  was,
  badge,
  selected,
  accent,
  compact,
  onSelect,
}: {
  name: string;
  label: string;
  terms?: string | null;
  was?: string | null;
  badge?: string | null;
  selected: boolean;
  accent: string;
  compact: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 transition-colors ${
        compact ? "py-1.5" : "py-2.5"
      }`}
      style={{
        borderColor: selected ? accent : "var(--border)",
        background: selected ? tint(accent, 0.08) : undefined,
      }}
    >
      <input
        type="radio"
        name={name}
        checked={selected}
        onChange={onSelect}
        className="size-[18px] shrink-0 cursor-pointer"
        style={{ accentColor: accent }}
      />
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <span
          className={`font-display font-semibold tabular-nums ${compact ? "text-[0.92rem]" : "text-[1.02rem]"}`}
          style={selected ? { color: accent } : undefined}
        >
          {label}
        </span>
        {was && <span className="text-[0.78rem] text-muted line-through tabular-nums">{was}</span>}
        {terms && <span className="text-[0.76rem] leading-snug text-muted">{terms}</span>}
      </span>
      {badge && (
        <span
          className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-semibold"
          style={{ background: tint(accent, 0.16), color: accent }}
        >
          {badge}
        </span>
      )}
    </label>
  );
}

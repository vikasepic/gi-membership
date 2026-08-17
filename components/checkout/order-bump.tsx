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
  options = null,
  choice,
  onChoose,
  /** Tighter spacing for the admin preview pane. */
  compact = false,
  quiet = false,
}: {
  view: BumpView;
  /**
   * A second billing option for the same thing — monthly beside yearly.
   *
   * With one price a tickbox is the right control: there is a single thing to
   * say yes to. With two, ticking is not enough, so the card grows a radio
   * group and "No thanks" becomes an option someone has to be able to get back
   * to — a radio cannot be unticked by clicking it again.
   *
   * Superseded by `options`, which says the same thing for any number. Kept
   * because it is what the live checkout still passes.
   */
  alt?: BumpView | null;
  /**
   * Every way to buy this, in the order the placement stored them.
   *
   * The generalisation of `alt`: an offer holds its own list of prices now, and
   * a placement chooses which of them to show, so the card can carry two or
   * four. `alt` is folded into this below, so there is one code path and the
   * two-price layout that already exists is the three-item case of it.
   */
  options?: BumpView[] | null;
  /** null while nobody has answered — nothing is selected and nothing is implied. */
  choice: BumpChoice | null;
  onChoose: (next: BumpChoice) => void;
  compact?: boolean;
  /**
   * The same card, said in an indoor voice.
   *
   * A solid accent bar and a two-pixel border earn attention on a page of plain
   * white boxes, which is the checkout this shipped on. On the redesign every
   * section is already a card, so the loudest thing on the page became an
   * add-on nobody asked for — and an offer that shouts over the thing being
   * bought reads as a page trying to sell you something else.
   *
   * Nothing is hidden: the banner and the saving still appear, as a label and a
   * badge inside the card rather than a bar across the top of it.
   */
  quiet?: boolean;
}) {
  const id = useId();
  const descId = `${id}-desc`;
  const { accent, ink } = view;
  const checked = choice !== "none" && choice !== null;
  // One list, however it arrived. A single price stays a tickbox — there is
  // nothing to choose between — and anything more is a radio group.
  const list = options && options.length > 0 ? options : alt ? [view, alt] : [];
  const choosing = list.length > 1;
  // Answers in the caller's own language. The live checkout posts "main" and
  // "alt" and its server reads them, so a component that started replying with
  // 0 and 1 would break the money path on the way past. Callers that pass a
  // list get indexes; the two-price caller keeps the two words until the
  // checkout itself moves over.
  const legacy = !(options && options.length > 0);
  const answer = (i: number): BumpChoice => (legacy ? (i === 0 ? "main" : "alt") : i);
  const isPicked = (i: number) => choice === i || choice === answer(i);

  return (
    <div
      // @container, not viewport breakpoints: this sits in a ~270px order
      // summary on a wide screen and a full-width column on a phone, so `sm:`
      // would widen the layout exactly where there is least room.
      className={`@container overflow-hidden rounded-2xl transition-shadow duration-200 ${
        quiet ? "border border-dashed" : "border-2 bg-surface"
      }`}
      style={{
        borderColor: quiet ? tint(accent, 0.55) : accent,
        background: quiet ? tint(accent, 0.06) : undefined,
        boxShadow: checked ? `0 0 0 4px ${tint(accent, 0.18)}` : undefined,
      }}
    >
      {/* The banner, as a line inside the card rather than a bar across it. */}
      {quiet && (view.banner || view.saveBadge) && (
        <div className={`flex items-center justify-between gap-3 ${compact ? "px-3 pt-3" : "px-4 pt-4"}`}>
          {view.banner && (
            <span
              className="font-display font-semibold uppercase tracking-[0.1em]"
              style={{ color: accent, fontSize: "0.68rem" }}
            >
              {view.banner}
            </span>
          )}
          {view.saveBadge && (
            <span
              className="whitespace-nowrap rounded-full px-2.5 py-0.5 font-display font-semibold text-white"
              style={{ background: accent, fontSize: "0.64rem" }}
            >
              {view.saveBadge}
            </span>
          )}
        </div>
      )}

      {!quiet && view.banner && (
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
        {!choosing && (
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
            <span className={`flex flex-wrap items-baseline gap-x-2 tabular-nums @md:max-w-[46%] @md:flex-col @md:items-end @md:gap-x-0 @md:text-right ${choosing ? "hidden" : ""}`}>
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
            /* One per line, always.
               It was two columns from `@lg` up, and a grid fills row-wise — so
               reading down the left-hand column gave bullets 1, 3, 5 while the
               eye expected 1, 2, 3. With bullets of uneven length the two
               columns also ended at different heights, which read as two
               separate lists rather than one. A bump is skimmed in about two
               seconds; a list whose order has to be worked out is a list nobody
               finishes. */
            <ul
              className={`flex list-none flex-col gap-1 p-0 ${
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

          {choosing && (
            <fieldset className="flex flex-col gap-1.5 border-0 p-0">
              <legend className="sr-only">{view.headline} — choose how you pay</legend>
              {list.map((option, i) => (
                <Option
                  key={i}
                  name={id}
                  // The plan price, not the charge-now one: through a trial
                  // every option is $0 today, and a choice between two $0s is
                  // not a choice anyone can make.
                  label={option.planLabel ?? option.nowLabel}
                  terms={optionTerms(option)}
                  was={option.wasLabel}
                  badge={option.saveBadge}
                  selected={isPicked(i)}
                  accent={accent}
                  compact={compact}
                  onSelect={() => onChoose(answer(i))}
                />
              ))}
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

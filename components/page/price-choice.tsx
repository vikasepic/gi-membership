"use client";

import { useState } from "react";
import { money } from "@/lib/money";
import { readableInk, tint } from "@/lib/color";
import { acceptOtoAction } from "@/app/(store)/checkout/oto/actions";
import {
  chargeNowCents,
  priceLabel,
  priceTerms,
  savingAgainst,
  type OfferPrice,
} from "@/lib/offer-prices";

/**
 * A choice of ways to pay, and the button that takes it.
 *
 * A block rather than something baked into the checkout, because the page doing
 * the selling is whichever page is doing the selling — a sales page, an upsell,
 * the checkout itself. Everything it draws is styleable from the panel, and
 * every figure in it is derived from the real prices, so nothing here can
 * outlive a price change and start lying.
 *
 * The choice travels. A buyer who picks the yearly on the sales page arrives at
 * the checkout with the yearly already selected — and can still change it
 * there. Carried as the price's ID in the link, which is safe because it only
 * decides which radio starts ticked: what is CHARGED is resolved on the server
 * from its own list, and an id it does not recognise simply preselects nothing.
 */

export type PriceChoiceStyle = {
  optionBg: string | null;
  optionBorder: string | null;
  optionRadius: number;
  selectedColor: string | null;
  selectedBg: string | null;
  selectedTextColor: string | null;
  labelColor: string | null;
  termsColor: string | null;
  headingColor: string | null;
  noteColor: string | null;
  headingSize: number | null;
  priceSize: number | null;
  termsSize: number | null;
  noteSize: number | null;
  buttonSize: number | null;
  /** The decline link's own ink and size. See declineHref. */
  declineColor: string | null;
  declineSize: number | null;
  /**
   * The "$0 today" line's own ink and size.
   *
   * Its own, and not the terms', because they are different sentences in
   * different places: the terms sit inside an option describing what it is,
   * and this sits under the button saying what happens when it is pressed.
   * Sharing a colour meant restyling one silently restyled the other.
   */
  dueTodayColor: string | null;
  dueTodaySize: number | null;
  /** Where the block's own words sit. The option rows are always left. */
  align: "left" | "center" | "right";
  badgeBg: string | null;
  badgeColor: string | null;
  buttonBg: string | null;
  buttonColor: string | null;
  buttonRadius: number;
  showTerms: boolean;
  showCompareAt: boolean;
  showSaving: boolean;
  showDueToday: boolean;
};

export function PriceChoice({
  prices,
  currency,
  heading,
  note,
  acceptLabel,
  href,
  declineHref,
  declineLabel,
  onChoose,
  otoToken,
  chosen,
  band,
  s,
}: {
  prices: OfferPrice[];
  currency: string;
  heading: string;
  note: string;
  acceptLabel: string;
  /** Where the button goes. The chosen price is appended to it. */
  href: string | null;
  /**
   * Where declining goes, and what it is called.
   *
   * Given by the PAGE, never typed into the block. The upsell has somewhere to
   * decline to; a sales page does not, and the way to decline one is to leave
   * it. A block cannot know which of the two it was dropped on, so it is not
   * asked to.
   */
  declineHref?: string | null;
  declineLabel?: string | null;
  /** On the checkout, where choosing is the whole point and there is no link. */
  onChoose?: (index: number) => void;
  /**
   * The one-click token, on an upsell.
   *
   * An upsell is the one page where the card is already on file — that is the
   * entire proposition. Given a token, the button stops being a LINK to a
   * checkout and becomes a submit that charges the saved card, because sending
   * somebody who has just paid back to a form asking for the card again is the
   * one thing a one-click upsell must not do.
   */
  otoToken?: string | null;
  /** Preselected — from the link that brought them here. */
  chosen?: number | null;
  band: { fg: string; muted: string; rule: string; accent: string; panel: string };
  s: PriceChoiceStyle;
}) {
  const [picked, setPicked] = useState<number | null>(chosen ?? (prices.length === 1 ? 0 : null));
  if (prices.length === 0) return null;

  const accent = s.selectedColor || band.accent;
  const buttonBg = s.buttonBg || band.accent;
  const buttonFg = s.buttonColor || readableInk(buttonBg);
  const waiting = prices.length > 1 && picked === null;
  const price = picked === null ? null : prices[picked];

  // A size only when one was set, so a block that has never been touched
  // renders the identical markup it always has.
  const px = (n: number | null) => (n == null ? undefined : n);
  const alignment =
    s.align === "left" ? "text-left" : s.align === "right" ? "text-right" : "text-center";

  const take = (i: number) => {
    setPicked(i);
    onChoose?.(i);
  };

  return (
    <div className="flex flex-col gap-3">
      {heading.trim() && (
        <p
          className={`font-display font-semibold ${alignment}`}
          style={{ color: s.headingColor || band.fg, fontSize: px(s.headingSize) }}
        >
          {heading}
        </p>
      )}

      <div className="flex flex-col gap-2" role="radiogroup" aria-label={heading || "Ways to pay"}>
        {prices.map((p, i) => {
          const on = picked === i;
          const saving = s.showSaving && i > 0 ? savingAgainst(prices[0], p) : null;
          return (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-3 border px-3 py-2.5 transition-colors"
              style={{
                borderRadius: s.optionRadius,
                borderColor: on ? accent : s.optionBorder || band.rule,
                // The chosen fill, or a tint of the chosen colour when none is
                // set — which is what it always did.
                background: on ? s.selectedBg || tint(accent, 0.08) : s.optionBg || "transparent",
              }}
            >
              <input
                type="radio"
                name="way-to-pay"
                checked={on}
                onChange={() => take(i)}
                className="size-[18px] shrink-0 cursor-pointer"
                style={{ accentColor: accent }}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className="font-display text-[1.02rem] font-semibold tabular-nums"
                  style={{
                    color: on ? accent : s.labelColor || band.fg,
                    fontSize: px(s.priceSize),
                  }}
                >
                  {priceLabel(p, currency)}
                  {p.label.trim() && (
                    <span
                      className="ml-2 text-[0.72rem] font-medium"
                      style={{ color: (on && s.selectedTextColor) || s.termsColor || band.muted }}
                    >
                      {p.label.trim()}
                    </span>
                  )}
                </span>
                {s.showTerms && priceTerms(p, currency) && (
                  <span
                    className="text-[0.76rem] leading-snug"
                    style={{
                      color: (on && s.selectedTextColor) || s.termsColor || band.muted,
                      fontSize: px(s.termsSize),
                    }}
                  >
                    {priceTerms(p, currency)}
                  </span>
                )}
              </span>
              {s.showCompareAt && p.compareAtCents && (
                <span
                  className="shrink-0 text-[0.78rem] line-through tabular-nums"
                  style={{ color: s.termsColor || band.muted }}
                >
                  {money(p.compareAtCents, currency)}
                </span>
              )}
              {saving && (
                <span
                  className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-semibold"
                  style={{
                    background: s.badgeBg || tint(accent, 0.14),
                    color: s.badgeColor || accent,
                  }}
                >
                  {saving}
                </span>
              )}
            </label>
          );
        })}
      </div>

      {/* One click, where the card is already on file. The chosen price rides
          as its INDEX into the list the server rebuilds, never as an id and
          never as an amount — the same contract the built-in upsell uses. */}
      {otoToken ? (
        <form action={acceptOtoAction} className="w-full">
          <input type="hidden" name="token" value={otoToken} />
          <input type="hidden" name="choice" value={picked ?? ""} />
          <button
            type="submit"
            disabled={waiting}
            className="w-full px-5 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              background: buttonBg,
              color: buttonFg,
              borderRadius: s.buttonRadius,
              fontSize: px(s.buttonSize),
            }}
          >
            {waiting ? "Choose one above" : acceptLabel}
          </button>
        </form>
      ) : href && !waiting ? (
        <a
          href={price ? `${href}${href.includes("?") ? "&" : "?"}price=${price.id}` : href}
          className="w-full px-5 py-3 text-center text-sm font-medium transition-opacity hover:opacity-90"
          style={{
            background: buttonBg,
            color: buttonFg,
            borderRadius: s.buttonRadius,
            fontSize: px(s.buttonSize),
          }}
        >
          {acceptLabel}
        </a>
      ) : (
        <button
          type="button"
          disabled={waiting}
          onClick={() => price && onChoose?.(picked as number)}
          className="w-full px-5 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{
            background: buttonBg,
            color: buttonFg,
            borderRadius: s.buttonRadius,
            fontSize: px(s.buttonSize),
          }}
        >
          {waiting ? "Choose one above" : acceptLabel}
        </button>
      )}

      {note.trim() && (
        <p
          className={`text-[0.76rem] ${alignment}`}
          style={{ color: s.noteColor || band.muted, fontSize: px(s.noteSize) }}
        >
          {note}
        </p>
      )}
      {declineHref && declineLabel?.trim() && (
        <a
          href={declineHref}
          className={`text-[0.76rem] underline ${alignment}`}
          style={{ color: s.declineColor || band.muted, fontSize: px(s.declineSize) }}
        >
          {declineLabel}
        </a>
      )}
      {price && s.showDueToday && (
        <p
          className={`text-[0.72rem] ${alignment}`}
          style={{ color: s.dueTodayColor || band.muted, fontSize: px(s.dueTodaySize) }}
        >
          {money(chargeNowCents(price), currency)} today
        </p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Section } from "@/components/admin/form-controls";
import { PricePicker } from "@/components/admin/price-picker";
import { money } from "@/lib/money";
import {
  chargeNowCents,
  priceLabel,
  priceTerms,
  savingAgainst,
  shownPrices,
  type OfferPrice,
} from "@/lib/offer-prices";

/**
 * The upsell, the sticky bar and the sales page, at any number of prices.
 *
 * The upsell today is two forms side by side with a hidden `choice=alt` in
 * each — one click, nothing to fill in, which is the whole conversion argument
 * for the page. Two buttons is fine; four is a wall. So it becomes a choice
 * and one button, and the cost of that is honestly one extra click.
 *
 * The sticky bar is the part nobody thinks about until it is wrong. It follows
 * the selection: it cannot offer to buy something before something has been
 * chosen, and a bar that says a price the radio above it does not is the page
 * disagreeing with itself while somebody decides to spend money.
 */

const CURRENCY = "usd";

const START: OfferPrice[] = [
  {
    id: "u-monthly",
    label: "",
    billingType: "recurring",
    interval: "month",
    intervalCount: 1,
    trialDays: null,
    priceCents: 1900,
    compareAtCents: null,
    archived: false,
  },
  {
    id: "u-yearly",
    label: "Best value",
    billingType: "recurring",
    interval: "year",
    intervalCount: 1,
    trialDays: null,
    priceCents: 14900,
    compareAtCents: 22800,
    archived: false,
  },
  {
    id: "u-once",
    label: "",
    billingType: "one_time",
    interval: null,
    intervalCount: 1,
    trialDays: null,
    priceCents: 39000,
    compareAtCents: null,
    archived: false,
  },
];

export function UpsellPrototype() {
  const [prices] = useState<OfferPrice[]>(START);
  const [ids, setIds] = useState<string[]>(["u-monthly", "u-yearly"]);
  const [choice, setChoice] = useState<number | null>(null);
  const [accept, setAccept] = useState("Yes, add this to my order");
  const [decline, setDecline] = useState("No thanks, I'll pass");

  const shown = shownPrices(prices, ids);
  const picked = choice === null ? null : (shown[choice] ?? null);

  return (
    <div className="flex flex-col gap-5">
      <Section
        title="What the upsell offers"
        hint="The same prices as everywhere else — this placement just picks which of them to put on the page."
      >
        <div className="flex flex-col gap-4">
          <PricePicker
            label="Prices to show"
            hint="from the offer"
            prices={prices}
            currency={CURRENCY}
            name="upsellPriceIds"
            chosen={ids}
            onChange={(next) => {
              setIds(next);
              setChoice(null);
            }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Accept button
              <input
                value={accept}
                onChange={(e) => setAccept(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-fg"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Decline link
              <input
                value={decline}
                onChange={(e) => setDecline(e.target.value)}
                className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-fg"
              />
            </label>
          </div>
          {/* The editor can add or remove a way to pay here too, so the three
              panels below can be seen at two, three and four without leaving
              the page. */}
          <button
            type="button"
            onClick={() => {
              const third = prices.find((p) => !ids.includes(p.id));
              if (third) setIds([...ids, third.id]);
            }}
            disabled={ids.length >= prices.length}
            className="self-start rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:border-primary disabled:opacity-40"
          >
            Show one more
          </button>
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="On the upsell page" hint="A choice, then one button — your pick.">
          <div className="rounded-2xl border border-border bg-surface-2 p-5">
            <p className="font-display text-lg font-semibold">One more thing before your receipt</p>
            <p className="mt-1 text-sm text-muted">
              The Vault — every funnel we have built, ready to copy.
            </p>

            <div className="mt-4 flex flex-col gap-2">
              {shown.map((p, i) => {
                const saving = i === 0 ? null : savingAgainst(shown[0], p);
                return (
                  <label
                    key={p.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                      choice === i ? "border-primary bg-primary/5" : "border-border hover:border-primary"
                    }`}
                  >
                    <input
                      type="radio"
                      name="oto-choice"
                      checked={choice === i}
                      onChange={() => setChoice(i)}
                      className="size-[18px] shrink-0 cursor-pointer accent-[var(--primary)]"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-display text-[1.02rem] font-semibold tabular-nums">
                        {priceLabel(p, CURRENCY)}
                        {p.label.trim() && (
                          <span className="ml-2 text-[0.72rem] font-medium text-muted">
                            {p.label.trim()}
                          </span>
                        )}
                      </span>
                      {priceTerms(p, CURRENCY) && (
                        <span className="text-[0.76rem] leading-snug text-muted">
                          {priceTerms(p, CURRENCY)}
                        </span>
                      )}
                    </span>
                    {p.compareAtCents && (
                      <span className="shrink-0 text-[0.78rem] text-muted line-through tabular-nums">
                        {money(p.compareAtCents, CURRENCY)}
                      </span>
                    )}
                    {saving && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
                        {saving}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            <button
              type="button"
              disabled={shown.length > 1 && choice === null}
              className="mt-4 w-full rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-fg disabled:opacity-50"
            >
              {accept}
              {picked && ` — ${money(chargeNowCents(picked), CURRENCY)} today`}
            </button>
            <p className="mt-2 text-center text-xs text-muted underline">{decline}</p>

            {shown.length > 1 && choice === null && (
              <p className="mt-3 rounded-lg border border-border bg-surface px-3 py-2 text-[0.72rem] text-muted">
                The button waits. One click was the whole argument for this page, and
                with a choice on it the click cannot happen until the choice has.
              </p>
            )}
          </div>
        </Section>

        <Section
          title="The sticky bar"
          hint="It follows the choice. A bar quoting a price the page does not is the page disagreeing with itself."
        >
          <div className="rounded-2xl border border-border bg-surface-2 p-5">
            <p className="mb-3 text-xs text-muted">
              …the page scrolls under it. The clock is the token&rsquo;s real
              expiry — when it hits zero the offer genuinely cannot be accepted.
            </p>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-lg">
              <span className="font-mono text-sm tabular-nums text-primary">12:41</span>
              <span className="min-w-0 flex-1 text-sm">
                {picked ? (
                  <>
                    <b className="font-medium">{priceLabel(picked, CURRENCY)}</b>
                    <span className="text-muted">
                      {" "}
                      · {money(chargeNowCents(picked), CURRENCY)} today
                    </span>
                  </>
                ) : shown.length > 1 ? (
                  <span className="text-muted">Choose how you want to pay</span>
                ) : (
                  <b className="font-medium">{priceLabel(shown[0], CURRENCY)}</b>
                )}
              </span>
              <button
                type="button"
                disabled={shown.length > 1 && choice === null}
                className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-fg disabled:opacity-50"
              >
                {shown.length > 1 && choice === null ? "Pick a price ↑" : accept}
              </button>
            </div>
            <p className="mt-3 text-[0.72rem] leading-relaxed text-muted">
              With nothing chosen the bar does not offer to buy anything — it
              sends you back up to the choice. Choosing one price and being
              charged for another because the bar had its own idea is the worst
              failure this page could have.
            </p>
          </div>
        </Section>
      </div>

      <Section
        title="On the normal sales page"
        hint="The price card block, showing every way to pay rather than the two slots it has today."
      >
        <div className="rounded-2xl border border-border bg-surface-2 p-6">
          <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
            <p className="kicker text-muted">The Vault</p>
            <div className="mt-4 flex flex-col gap-2">
              {shown.map((p, i) => {
                const saving = i === 0 ? null : savingAgainst(shown[0], p);
                return (
                  <div
                    key={p.id}
                    className={`flex items-baseline justify-between gap-3 rounded-xl border px-3 py-2.5 text-left ${
                      i === 0 ? "border-primary" : "border-border"
                    }`}
                  >
                    <span className="flex flex-col">
                      <span className="font-display text-lg font-semibold tabular-nums">
                        {priceLabel(p, CURRENCY)}
                      </span>
                      {priceTerms(p, CURRENCY) && (
                        <span className="text-[0.72rem] text-muted">{priceTerms(p, CURRENCY)}</span>
                      )}
                    </span>
                    {saving && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
                        {saving}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="mt-5 w-full rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-fg"
            >
              Get instant access
            </button>
            <p className="mt-2 text-[0.72rem] text-muted">
              {shown.length > 1
                ? "Pick which one on the checkout"
                : priceTerms(shown[0], CURRENCY) ?? "One payment"}
            </p>
          </div>

          <p className="mx-auto mt-4 max-w-md text-[0.72rem] leading-relaxed text-muted">
            The decision here: a price card is a composition, not a
            variable-length list. Two prices in it reads well and four does not,
            so the block can either draw them all — as above — or draw the
            headline and send the choice to the checkout. Both are live in this
            panel; the numbers are real either way, because they come from the
            same prices as the bump.
          </p>
        </div>
      </Section>
    </div>
  );
}

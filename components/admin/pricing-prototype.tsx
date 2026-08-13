"use client";

import { useState } from "react";
import { OfferPriceFields } from "@/components/admin/offer-price-fields";
import { PricePicker } from "@/components/admin/price-picker";
import { OrderBump } from "@/components/checkout/order-bump";
import { Section } from "@/components/admin/form-controls";
import { buildBumpView, type BumpChoice, type BumpView } from "@/lib/bump";
import { money } from "@/lib/money";
import { chargeNowCents, savingAgainst, shownPrices, type OfferPrice } from "@/lib/offer-prices";

/**
 * The three designs, wired to one another.
 *
 * A prototype that cannot be typed into is a picture, and a picture agrees with
 * whatever you already thought. Everything here is live: add a price on the
 * left and it appears in the placement picker; tick two and the bump underneath
 * becomes a radio group. That is the only way to find out whether four options
 * in a 330px column is a design or a wall.
 *
 * Nothing is saved. There is no schema behind this yet — the whole point of
 * building it first is to disagree with it cheaply.
 */

const CURRENCY = "usd";

const START: OfferPrice[] = [
  {
    id: "p-monthly",
    label: "",
    billingType: "recurring",
    interval: "month",
    intervalCount: 1,
    trialDays: 7,
    priceCents: 2900,
    compareAtCents: null,
    archived: false,
  },
  {
    id: "p-yearly",
    label: "",
    billingType: "recurring",
    interval: "year",
    intervalCount: 1,
    trialDays: null,
    priceCents: 29000,
    compareAtCents: 34800,
    archived: false,
  },
  {
    id: "p-once",
    label: "",
    billingType: "one_time",
    interval: null,
    intervalCount: 1,
    trialDays: null,
    priceCents: 49000,
    compareAtCents: null,
    archived: false,
  },
];

/** Enough of an offer for buildBumpView — the copy half, which never varies. */
const COPY = {
  name: "The Funnel Vault",
  headline: "Add the Funnel Vault",
  description: "Every funnel we have built, in the tool, ready to copy.",
  bumpHeadline: null,
  bumpDescription: null,
  bumpBanner: null,
  bumpBullets: ["41 finished funnels", "Swipe any of them in one click", "New ones every month"],
  bumpNote: null,
  bumpAccent: "#b0532f",
  currency: CURRENCY,
  compareAtCents: null as number | null,
};

/** Pretend somebody is already subscribed on the monthly. */
const USAGE = { "p-monthly": 14 };

export function PricingPrototype() {
  const [prices, setPrices] = useState<OfferPrice[]>(START);
  const [bumpIds, setBumpIds] = useState<string[]>(["p-monthly", "p-yearly"]);
  const [choice, setChoice] = useState<BumpChoice | null>(null);

  const shown = shownPrices(prices, bumpIds);
  const options: BumpView[] = shown.map((p, i) => {
    const view = buildBumpView({
      ...COPY,
      billingType: p.billingType,
      interval: p.interval,
      priceCents: p.priceCents,
      trialDays: p.trialDays,
      compareAtCents: p.compareAtCents,
    });
    // The badge is derived per option and against the first one, so a yearly
    // beside a monthly can say what it saves without anybody typing a number
    // that outlives the next price change.
    const saving = i === 0 ? null : savingAgainst(shown[0], p);
    return { ...view, saveBadge: view.saveBadge ?? saving };
  });

  const picked =
    typeof choice === "number" ? shown[choice] : choice === "main" ? shown[0] : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="1 · On the offer"
          hint="Ways to pay live here now, so one offer can be sold monthly, yearly or once."
        >
          <OfferPriceFields
            prices={prices}
            currency={CURRENCY}
            name="prices"
            usage={USAGE}
            onChange={(next) => {
              setPrices(next);
              setChoice(null);
            }}
          />
        </Section>

        <Section
          title="2 · On the product"
          hint="The two Second price dropdowns are gone. Pick the offer, then tick what its checkout shows."
        >
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Order bump
              <select
                disabled
                className="rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-sm text-fg"
                value="vault"
              >
                <option value="vault">The Funnel Vault</option>
              </select>
            </label>

            <PricePicker
              label="Prices to show"
              hint="dynamic — from the offer above"
              prices={prices}
              currency={CURRENCY}
              name="bumpPriceIds"
              chosen={bumpIds}
              onChange={(next) => {
                setBumpIds(next);
                setChoice(null);
              }}
            />
          </div>
        </Section>
      </div>

      <Section
        title="3 · On the checkout"
        hint="The real order bump component, at whatever number you ticked above."
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* 330px, because that is what the live order summary gives it on a
              wide screen — the width where a four-option radio group either
              works or does not. */}
          <div className="w-full max-w-[330px] shrink-0">
            <span className="mb-1.5 block text-[0.66rem] text-muted">
              in the order summary · 330px
            </span>
            <OrderBump
              view={options[0]}
              options={options}
              choice={choice}
              onChoose={setChoice}
            />
          </div>

          <div className="min-w-0 flex-1">
            <span className="mb-1.5 block text-[0.66rem] text-muted">
              full width · under the card fields
            </span>
            <OrderBump view={options[0]} options={options} choice={choice} onChoose={setChoice} />
          </div>
        </div>

        <p className="mt-4 rounded-xl border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed">
          {options.length > 1 && choice === null ? (
            <>
              <strong className="font-medium">The pay button is held.</strong> With a choice
              on the card, nothing is selected until the buyer selects it — declining is
              something they do, not something that happens by not reading.
            </>
          ) : picked ? (
            <>
              Charged today:{" "}
              <strong className="font-medium">
                {money(chargeNowCents(picked), CURRENCY)}
              </strong>
              {chargeNowCents(picked) === 0 && " — the trial is the point of one"}. Added to
              the order on top of the product.
            </>
          ) : (
            <>Nothing added. The buyer pays for the product alone.</>
          )}
        </p>
      </Section>
    </div>
  );
}

"use client";

import { money } from "@/lib/money";
import { priceTerms } from "@/lib/offer-prices";
import {
  BuyerDetailsSlot,
  CardFieldsSlot,
  CouponSlot,
  OrderBumpSlot,
  OrderSummarySlot,
  PayButtonSlot,
  PriceChoiceSlot,
  useCheckout,
} from "@/components/checkout/slots";

/**
 * The redesigned checkout, arranged.
 *
 * Not a second checkout — the same slots the shipped one is built from, in a
 * different order with different room. Every one of them reads the live form
 * out of context, so this renders the real Stripe element, the real coupon
 * action, the real bump and the real pay button. A bug fixed in the pay button
 * is fixed on both, which is the only reason it was worth having a second
 * arrangement at all.
 *
 * Two shapes fall out of the data rather than a prop:
 *
 *   Signed in  — the account is known, so there is nothing to ask before the
 *                plan and the steps are not numbered.
 *   Anonymous  — where to send it, then how to pay, numbered, because those
 *                genuinely are two steps and people leave in the gap.
 *
 * That covers both halves of the store: an offer checkout always has somebody
 * signed in, a product checkout usually does not.
 */
export function CheckoutV2Layout() {
  const c = useCheckout();
  if (!c) return null;

  const known = Boolean(c.signedInEmail);
  const card = "flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6";

  return (
    <div className="flex flex-col gap-5">
      {/* Who this attaches to, and how they want it. Both before the card:
          a form that asks for a card first is asking somebody to commit
          before it has finished saying to what. */}
      <div className={known ? "flex flex-col gap-5" : card}>
        {!known && <Step n={1} label="Where should we send it?" />}
        {/* The country is asked for inside Stripe's own form below, so this
            block does not ask a second time. */}
        <BuyerDetailsSlot title={known ? "Your account" : ""} hideCountry />
      </div>

      <PriceChoiceSlot title="Choose your plan" variant="cards" />

      <div className={card}>
        {!known && <Step n={2} label="Payment" />}
        <CardFieldsSlot heading={known ? "Payment method" : ""} tabs collectCountry />
        <span className="text-muted" style={{ fontSize: "0.74rem", lineHeight: 1.5 }}>
          {c.totalNow === 0
            ? "Your card is saved for the renewal. Nothing is charged today."
            : "The country above sets the tax rate on your receipt."}
        </span>
      </div>

      {/* The add-on, between the card and the total: after the decision to pay
          is made, and still above the figure it changes. */}
      <OrderBumpSlot />

      <div className={card}>
        <OrderSummarySlot showTax={false} />
        <CouponSlot />
        <DueRow />
        <PayButtonSlot trialLabel="Start my free trial" note="" />
      </div>
    </div>
  );
}

/** A numbered heading. Numbers, because these are ordered steps and not sections. */
function Step({ n, label }: { n: number; label: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="grid size-[22px] shrink-0 place-items-center rounded-full bg-navy font-semibold text-white"
        style={{ fontSize: "0.72rem" }}
      >
        {n}
      </span>
      <span className="font-display font-semibold text-fg" style={{ fontSize: "0.95rem" }}>
        {label}
      </span>
    </span>
  );
}

/**
 * The total, at the size of the thing being agreed to.
 *
 * Its own component rather than DueTodaySlot because this one carries the
 * renewal sentence for the CHOSEN plan as well as for the bump — on a trial,
 * "$0 due today" without a date and a price beside it is how a first renewal
 * becomes a dispute, and that sentence is the whole reason this block exists.
 */
function DueRow() {
  const c = useCheckout();
  if (!c) return null;
  const trial = c.totalNow === 0;
  const chosen = c.pricePick === null ? null : (c.prices[c.pricePick] ?? null);
  // What happens after today, for the plan and for the add-on. Both, because a
  // buyer can be starting two subscriptions on one press and only being told
  // about one of them is the thing that becomes a dispute.
  const renewals = [
    chosen ? priceTerms(chosen, c.product.currency) : null,
    c.chosenBump?.termsLabel ? `${c.chosenBump.name}: ${c.chosenBump.termsLabel}` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-display font-semibold text-fg" style={{ fontSize: "1rem" }}>
          {trial ? "Due today" : "Total today"}
        </span>
        <span
          className="font-display font-bold tabular-nums tracking-[-0.02em] text-fg"
          style={{ fontSize: "1.75rem" }}
        >
          {money(c.totalNow, c.product.currency)}
        </span>
      </div>
      {renewals.map((line) => (
        <span key={line} className="text-fg/85" style={{ fontSize: "0.82rem", lineHeight: 1.5 }}>
          {line.charAt(0).toUpperCase() + line.slice(1)}.
        </span>
      ))}
      <span className="text-muted" style={{ fontSize: "0.76rem", lineHeight: 1.5 }}>
        Tax is calculated at your country&rsquo;s rate and shown on your receipt.
      </span>
    </div>
  );
}

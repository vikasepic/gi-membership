"use client";

import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { startOffer } from "@/app/(store)/checkout/offer/actions";

export type OfferSummary = {
  id: string;
  headline: string;
  description: string | null;
  chargeNowCents: number;
  recurringNote: string | null;
  acceptLabel: string;
  currency: string;
};

import { money } from "@/lib/money";
import { priceLabel, priceTerms, chargeNowCents, type OfferPrice } from "@/lib/offer-prices";

export function OfferCheckoutForm({
  offer,
  email,
  publishableKey,
  prices = [],
  chosen = -1,
}: {
  offer: OfferSummary;
  email: string;
  publishableKey: string;
  /** Every way to pay. One or none means there is nothing to choose. */
  prices?: OfferPrice[];
  /** Preselected from the sales page. -1 when they arrived without choosing. */
  chosen?: number;
}) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  return (
    <Elements
      stripe={stripePromise}
      options={{
        // Setup, not payment: a trial charges nothing today, so there is no
        // amount to authorise — we are saving the card the subscription bills.
        // setupFutureUsage is deliberately absent: it describes a PaymentIntent,
        // and mode:"setup" already means "save this card for later".
        mode: "setup",
        currency: offer.currency,
        appearance: { theme: "stripe", variables: { colorPrimary: "#c8653d" } },
      }}
    >
      <Inner offer={offer} email={email} prices={prices} chosen={chosen} />
    </Elements>
  );
}

function Inner({
  offer,
  email,
  prices,
  chosen,
}: {
  offer: OfferSummary;
  email: string;
  prices: OfferPrice[];
  chosen: number;
}) {
  // Preselected from the sales page, and still changeable — somebody who
  // picked the yearly two pages ago should not have to pick it again, and
  // should not be stuck with it either.
  const [pick, setPick] = useState<number>(chosen >= 0 ? chosen : prices.length === 1 ? 0 : -1);
  const picked = pick >= 0 ? (prices[pick] ?? null) : null;
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!stripe || !elements) return;
    setBusy(true);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Check your card details");
      setBusy(false);
      return;
    }

    const res = await startOffer(offer.id, pick >= 0 ? pick : undefined);
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }

    const { error: setupError } = await stripe.confirmSetup({
      elements,
      clientSecret: res.clientSecret,
      confirmParams: { return_url: `${window.location.origin}/checkout/offer/complete` },
    });
    // Only reached if confirmation didn't redirect (i.e. something failed).
    if (setupError) setError(setupError.message ?? "Could not save your card");
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {/* Signed in already — shown so they can see which account this attaches
          to, but not editable: the session decides, not the form. */}
      <div className="flex flex-col gap-2">
        <span className="kicker text-muted">Your account</span>
        <div className="rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-sm text-muted">
          {email}
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="kicker mb-2 text-muted">Payment method</legend>
        <PaymentElement />
      </fieldset>

      {error && (
        <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          {error}
        </p>
      )}

      {/* The choice again, here, because a page that takes a card is the last
          honest place to change your mind. Preselected from the sales page. */}
      {prices.length > 1 && (
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="kicker mb-1 text-muted">How you want to pay</legend>
          {prices.map((p, i) => (
            <label
              key={p.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                pick === i ? "border-primary bg-primary/5" : "border-border hover:border-primary"
              }`}
            >
              <input
                type="radio"
                name="offer-price"
                checked={pick === i}
                onChange={() => setPick(i)}
                className="size-[18px] shrink-0 cursor-pointer accent-[var(--primary)]"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-display font-semibold tabular-nums">
                  {priceLabel(p, offer.currency)}
                  {p.label.trim() && (
                    <span className="ml-2 text-[0.72rem] font-medium text-muted">{p.label.trim()}</span>
                  )}
                </span>
                {priceTerms(p, offer.currency) && (
                  <span className="text-[0.76rem] text-muted">{priceTerms(p, offer.currency)}</span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <span className="text-muted">Due today</span>
        <span className="font-display text-2xl">
          {money(picked ? chargeNowCents(picked) : offer.chargeNowCents, offer.currency)}
        </span>
      </div>
      {picked
        ? priceTerms(picked, offer.currency) && (
            <p className="-mt-3 text-sm text-muted">{priceTerms(picked, offer.currency)}</p>
          )
        : offer.recurringNote && <p className="-mt-3 text-sm text-muted">{offer.recurringNote}</p>}

      <button
        type="submit"
        disabled={busy || !stripe}
        className="rounded-full bg-primary px-6 py-3.5 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {busy ? "Processing…" : offer.acceptLabel}
      </button>
    </form>
  );
}

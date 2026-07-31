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

export function OfferCheckoutForm({
  offer,
  email,
  publishableKey,
}: {
  offer: OfferSummary;
  email: string;
  publishableKey: string;
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
      <Inner offer={offer} email={email} />
    </Elements>
  );
}

function Inner({ offer, email }: { offer: OfferSummary; email: string }) {
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

    const res = await startOffer(offer.id);
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

      <div className="flex items-center justify-between border-t border-border pt-4">
        <span className="text-muted">Due today</span>
        <span className="font-display text-2xl">{money(offer.chargeNowCents, offer.currency)}</span>
      </div>
      {offer.recurringNote && <p className="-mt-3 text-sm text-muted">{offer.recurringNote}</p>}

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

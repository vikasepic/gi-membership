"use client";

import { useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { startCheckout } from "@/app/(store)/checkout/actions";

export type BumpSummary = {
  headline: string;
  description: string | null;
  chargeNowCents: number;
  recurringNote: string | null; // e.g. "then $47/mo after a 7-day trial"
  acceptLabel: string;
};

export type CheckoutProduct = {
  slug: string;
  title: string;
  priceCents: number;
  currency: string;
};

const money = (c: number, cur: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(c / 100);

export function CheckoutForm({
  product,
  bump,
  publishableKey,
}: {
  product: CheckoutProduct;
  bump: BumpSummary | null;
  publishableKey: string;
}) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  return (
    <Elements
      stripe={stripePromise}
      options={{
        mode: "payment",
        amount: product.priceCents,
        currency: product.currency,
        setupFutureUsage: "off_session",
        appearance: { theme: "stripe", variables: { colorPrimary: "#c8653d" } },
      }}
    >
      <Inner product={product} bump={bump} />
    </Elements>
  );
}

function Inner({ product, bump }: { product: CheckoutProduct; bump: BumpSummary | null }) {
  const stripe = useStripe();
  const elements = useElements();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [bumpTaken, setBumpTaken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bumpNow = bumpTaken && bump ? bump.chargeNowCents : 0;
  const totalNow = product.priceCents + bumpNow;

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

    const res = await startCheckout({
      productSlug: product.slug,
      email,
      username,
      password,
      bumpTaken,
    });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }

    const { error: payError } = await stripe.confirmPayment({
      elements,
      clientSecret: res.clientSecret,
      confirmParams: { return_url: `${window.location.origin}/checkout/complete` },
    });
    // Only reached if confirmation didn't redirect (i.e. an error occurred).
    if (payError) setError(payError.message ?? "Payment failed");
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-4">
        <legend className="kicker mb-2 text-muted">Your account</legend>
        <input
          type="email" required placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)} className={input}
        />
        <input
          type="text" required placeholder="Username" value={username}
          onChange={(e) => setUsername(e.target.value)} className={input}
        />
        <input
          type="password" required placeholder="Password (min 8 chars)" value={password}
          onChange={(e) => setPassword(e.target.value)} className={input}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="kicker mb-2 text-muted">Payment</legend>
        <PaymentElement />
      </fieldset>

      {bump && (
        <label className="flex cursor-pointer gap-3 rounded-2xl border border-border bg-surface p-4">
          <input
            type="checkbox" checked={bumpTaken}
            onChange={(e) => setBumpTaken(e.target.checked)}
            className="mt-1 size-4 accent-[var(--primary)]"
          />
          <span className="flex flex-col gap-1">
            <span className="font-medium">{bump.headline}</span>
            {bump.description && <span className="text-sm text-muted">{bump.description}</span>}
            <span className="text-sm text-primary">
              {bump.chargeNowCents === 0
                ? `${money(0, product.currency)} now`
                : `+${money(bump.chargeNowCents, product.currency)} now`}
              {bump.recurringNote ? ` — ${bump.recurringNote}` : ""}
            </span>
          </span>
        </label>
      )}

      {error && (
        <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <span className="text-muted">Total now</span>
        <span className="font-display text-2xl">{money(totalNow, product.currency)}</span>
      </div>

      <button
        type="submit"
        disabled={busy || !stripe}
        className="rounded-full bg-primary px-6 py-3.5 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {busy ? "Processing…" : `Pay ${money(product.priceCents, product.currency)}`}
      </button>
    </form>
  );
}

const input =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm outline-none transition-colors focus:border-primary";

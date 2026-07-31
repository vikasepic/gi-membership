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
  tagline: string | null;
  priceCents: number;
  currency: string;
};

import { money } from "@/lib/money";

// Buyer country drives the VAT rate. Common markets first, then the rest of the
// EU/UK where digital-services VAT applies at the buyer's rate.
const COUNTRIES = [
  { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" }, { code: "AU", name: "Australia" },
  { code: "IN", name: "India" }, { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" }, { code: "FR", name: "France" },
  { code: "ES", name: "Spain" }, { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" }, { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" }, { code: "PT", name: "Portugal" },
  { code: "SE", name: "Sweden" }, { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" }, { code: "PL", name: "Poland" },
  { code: "NO", name: "Norway" }, { code: "CH", name: "Switzerland" },
  { code: "NZ", name: "New Zealand" }, { code: "SG", name: "Singapore" },
  { code: "AE", name: "United Arab Emirates" }, { code: "ZA", name: "South Africa" },
];

export function CheckoutForm({
  product,
  bump,
  publishableKey,
  signedInEmail,
  defaultCountry,
}: {
  product: CheckoutProduct;
  bump: BumpSummary | null;
  publishableKey: string;
  // Present when a member is already signed in — we then ask for nothing but
  // payment, since we already know who they are.
  signedInEmail?: string | null;
  defaultCountry?: string | null;
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
      <Inner
        product={product}
        bump={bump}
        signedInEmail={signedInEmail ?? null}
        defaultCountry={defaultCountry ?? ""}
      />
    </Elements>
  );
}

function Inner({
  product,
  bump,
  signedInEmail,
  defaultCountry,
}: {
  product: CheckoutProduct;
  bump: BumpSummary | null;
  signedInEmail: string | null;
  defaultCountry: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState(defaultCountry);
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

    // A signed-in member sends no credentials; the server takes them from the
    // session, so nothing here can buy in someone else's name.
    const res = await startCheckout({
      productSlug: product.slug,
      ...(signedInEmail ? {} : { email, username, password }),
      bumpTaken,
      country,
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
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-12">
      {/* Left: what we need from them. */}
      <div className="flex flex-col gap-7 lg:col-span-7">
        {signedInEmail ? (
          <div className="flex flex-col gap-2">
            <span className="kicker text-muted">Your account</span>
            <div className="flex flex-wrap items-center gap-x-2 rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-sm">
              <span className="text-fg">{signedInEmail}</span>
              <span className="text-muted">— signed in</span>
            </div>
          </div>
        ) : (
          <fieldset className="flex flex-col gap-4">
            <legend className="kicker mb-2 text-muted">Your account</legend>
            <input
              type="email" required placeholder="Email" value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)} className={input}
            />
            <input
              type="text" required placeholder="Username" value={username}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)} className={input}
            />
            <input
              type="password" required placeholder="Password (min 8 chars)" value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)} className={input}
            />
          </fieldset>
        )}

        {/* Country determines the VAT rate on digital sales — Stripe cannot
            calculate tax without it. */}
        <div className="flex flex-col gap-2">
          <span className="kicker text-muted">Billing country</span>
          <select
            required
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={input}
            aria-label="Country"
            autoComplete="country"
          >
            <option value="">Country…</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="kicker mb-2 text-muted">Payment</legend>
          <PaymentElement />
        </fieldset>
      </div>

      {/* Right: what they're buying, and what it costs. Sticky on desktop so the
          total stays in view while they work down the form. */}
      <aside className="flex flex-col gap-5 lg:col-span-5">
        <div className="flex flex-col gap-5 rounded-3xl border border-border bg-surface p-6 lg:sticky lg:top-24">
          <span className="kicker text-muted">Order summary</span>

          <div className="flex flex-col gap-1">
            <span className="font-medium leading-snug">{product.title}</span>
            {product.tagline && <span className="text-sm text-muted">{product.tagline}</span>}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{product.title}</span>
            <span>{money(product.priceCents, product.currency)}</span>
          </div>

          {bumpTaken && bump && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">{bump.headline}</span>
              <span>{money(bump.chargeNowCents, product.currency)}</span>
            </div>
          )}

          <div className="flex items-baseline justify-between border-t border-border pt-4">
            <span className="text-muted">Total now</span>
            <span className="font-display text-2xl">{money(totalNow, product.currency)}</span>
          </div>
          {bumpTaken && bump?.recurringNote && (
            <p className="-mt-2 text-sm text-muted">{bump.recurringNote}.</p>
          )}
          <p className="-mt-2 text-xs text-muted">
            Tax is calculated at your country&rsquo;s rate and shown on your receipt.
          </p>

          {bump && (
            <label className="flex cursor-pointer gap-3 rounded-2xl border border-border bg-surface-2 p-4">
              <input
                type="checkbox" checked={bumpTaken}
                onChange={(e) => setBumpTaken(e.target.checked)}
                className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
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

          <button
            type="submit"
            disabled={busy || !stripe}
            className="rounded-full bg-primary px-6 py-3.5 font-medium text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {busy ? "Processing…" : `Pay ${money(totalNow, product.currency)}`}
          </button>
        </div>
      </aside>
    </form>
  );
}

const input =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm outline-none transition-colors focus:border-primary";

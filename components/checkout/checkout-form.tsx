"use client";

import { useMemo, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { startCheckout, previewCoupon, captureAbandonedCart } from "@/app/(store)/checkout/actions";
import { OrderBump } from "@/components/checkout/order-bump";
import { bumpNeedsAnswer, type BumpChoice } from "@/lib/bump";
import type { BumpView } from "@/lib/bump";

type AppliedDiscount = { label: string; discountCents: number; clamped: boolean };

// Mirrors MIN_CHARGE_CENTS in lib/coupons.ts, which is server-only and cannot
// be imported here. Display only — the server enforces the real floor.
const MIN_CHARGE_CENTS_CLIENT = 50;

// The bump's shape is now BumpView, built by lib/bump.ts so the checkout and
// the admin preview cannot diverge. Kept as an alias because several call
// sites and tests refer to it by the old name.
export type BumpSummary = BumpView;

export type CheckoutProduct = {
  slug: string;
  title: string;
  tagline: string | null;
  priceCents: number;
  currency: string;
  /** Cover thumbnail — the buyer should see what they're paying for. */
  coverUrl?: string | null;
};

import { money } from "@/lib/money";
import { suggestEmail } from "@/lib/email-hint";

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
  bumpAlt,
  publishableKey,
  signedInEmail,
  defaultCountry,
}: {
  product: CheckoutProduct;
  bump: BumpSummary | null;
  bumpAlt?: BumpSummary | null;
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
        bumpAlt={bumpAlt ?? null}
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
  bumpAlt,
  defaultCountry,
}: {
  product: CheckoutProduct;
  bump: BumpSummary | null;
  /** The bump's second billing option, when it has one. */
  bumpAlt: BumpSummary | null;
  signedInEmail: string | null;
  defaultCountry: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState(defaultCountry);
  // Which of the bump's prices was taken, if any.
  //
  // null is "has not answered yet" and is NOT the same as "none" — with two
  // prices nothing starts selected, so declining has to be a thing someone
  // does rather than a thing that happens to them by not reading. A
  // single-price bump has nothing to answer: an unticked box IS "none".
  const [bumpChoice, setBumpChoice] = useState<BumpChoice | null>(bumpAlt ? null : "none");
  const bumpUnanswered = bumpNeedsAnswer(!!bumpAlt, bumpChoice);
  const bumpRef = useRef<HTMLDivElement>(null);
  const chosenBump = bumpChoice === "alt" ? bumpAlt : bumpChoice === "main" ? bump : null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Which address we have already reported, so re-focusing the field or
  // tabbing back through the form does not fire again for the same person.
  const capturedEmail = useRef<string | null>(null);
  const [emailHint, setEmailHint] = useState<string | null>(null);

  function captureEmail() {
    const value = email.trim().toLowerCase();
    setEmailHint(suggestEmail(value));
    if (!value || !value.includes("@") || capturedEmail.current === value) return;
    capturedEmail.current = value;
    // Not awaited: this only buffers the address for an abandoned-cart email.
    // The buyer must never wait on it or see it fail.
    void captureAbandonedCart(product.slug, value, fullName.trim() || undefined);
  }

  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<AppliedDiscount | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const bumpNow = chosenBump?.chargeNowCents ?? 0;
  const discount = coupon?.discountCents ?? 0;
  const totalNow = product.priceCents - discount + bumpNow;

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);
    const res = await previewCoupon(product.slug, code);
    if (!res.ok) {
      setCoupon(null);
      setCouponError(res.error);
    } else {
      setCoupon({ label: res.label, discountCents: res.discountCents, clamped: res.clamped });
    }
    setCouponBusy(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Asked before the card is touched. Stripe validating the card first and
    // THEN being told to pick an add-on is two rounds of correction for one
    // form, and the second one arrives after the slow part.
    if (bumpUnanswered) {
      setError("Choose one of the options above to continue — including “No thanks”.");
      bumpRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      bumpRef.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
      return;
    }
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
      ...(signedInEmail ? {} : { email, fullName }),
      // The code, never the amount: the server prices it again.
      couponCode: coupon ? couponInput.trim() : null,
      bumpChoice: bumpChoice ?? "none",
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
      <div className="flex flex-col gap-6 lg:col-span-7">
        {signedInEmail ? (
          <div className="flex flex-col gap-2">
            <span className="kicker text-muted">Your account</span>
            <div className="flex flex-wrap items-center gap-x-2 rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-sm">
              <span className="text-fg">{signedInEmail}</span>
              <span className="text-muted">— signed in</span>
            </div>
          </div>
        ) : (
          /* Name, email and country are one block, two across from `sm` up.
             Three stacked full-width fields each with its own heading pushed
             the card entry below the fold on a laptop, and the further the
             payment form sits from the top the more people leave before they
             reach it. */
          <fieldset className="flex flex-col gap-3">
            <legend className="kicker mb-1 text-muted">Your details</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text" required placeholder="Full name" value={fullName}
                autoComplete="name" aria-label="Full name"
                onChange={(e) => setFullName(e.target.value)} className={input}
              />
              <input
                type="email" required placeholder="Email" value={email}
                autoComplete="email" aria-label="Email"
                onChange={(e) => setEmail(e.target.value)}
                // On blur rather than on every keystroke: mid-typing an address
                // is a different (and usually invalid) address, and tagging
                // "jane@gm" would put a junk contact in ActiveCampaign.
                onBlur={captureEmail}
                className={input}
              />
            </div>

            {/* The typo suggestion. This was computed and then thrown away when
                the layout was tightened — the state was set on blur and never
                rendered, so a mistyped address reached checkout silently. A
                wrong email is the most expensive mistake on this page: the
                receipt and the access link both follow it. */}
            {emailHint && (
              <p className="-mt-1 text-sm">
                <span className="text-muted">Did you mean </span>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(emailHint);
                    setEmailHint(null);
                    capturedEmail.current = null;
                  }}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  {emailHint}
                </button>
                <span className="text-muted">?</span>
              </p>
            )}
            {/* Country determines the VAT rate on digital sales — Stripe cannot
                calculate tax without it. */}
            <select
              required
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className={input}
              aria-label="Billing country"
              autoComplete="country"
            >
              <option value="">Billing country…</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
            {/* Kept: a typo in the email is the most expensive mistake
                available on this page. */}
            <span className="text-xs text-muted">
              Your receipt and access link go to this email. No password to create.
            </span>
          </fieldset>
        )}

        {signedInEmail && (
          <select
            required
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={input}
            aria-label="Billing country"
            autoComplete="country"
          >
            <option value="">Billing country…</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        )}

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

          {/* Show the thing being bought, not just its name. A cover beside the
              title is the cheapest reassurance on the page: it confirms they
              are paying for what they clicked. */}
          <div className="flex items-start gap-4">
            {product.coverUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={product.coverUrl}
                alt=""
                className="size-16 shrink-0 rounded-xl border border-border object-cover"
              />
            ) : (
              <div className="size-16 shrink-0 rounded-xl border border-border bg-surface-2" />
            )}
            <div className="flex flex-col gap-1">
              <span className="font-medium leading-snug">{product.title}</span>
              {product.tagline && <span className="text-sm text-muted">{product.tagline}</span>}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted">{product.title}</span>
            <span className="shrink-0">{money(product.priceCents, product.currency)}</span>
          </div>

          {coupon && (
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-navy">{coupon.label}</span>
              <span className="shrink-0 text-navy">
                −{money(coupon.discountCents, product.currency)}
              </span>
            </div>
          )}

          {chosenBump && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">{chosenBump.headline}</span>
              <span>{money(chosenBump.chargeNowCents, product.currency)}</span>
            </div>
          )}

          {/* Discount code. A plain input rather than a "have a code?" toggle:
              hiding it makes people leave to hunt for one, and this store's
              codes are handed out deliberately rather than scattered around. */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={couponInput}
                onChange={(e) => {
                  setCouponInput(e.target.value);
                  setCouponError(null);
                }}
                // Enter inside the discount field must not submit the payment
                // form — pressing it to "apply a code" and being charged
                // instead is the sort of surprise that ends in a chargeback.
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void applyCoupon();
                  }
                }}
                placeholder="Discount code"
                aria-label="Discount code"
                autoCapitalize="characters"
                spellCheck={false}
                className={`${input} uppercase placeholder:normal-case`}
              />
              <button
                type="button"
                onClick={() => void applyCoupon()}
                disabled={couponBusy || !couponInput.trim()}
                className="shrink-0 rounded-xl border border-border px-4 text-sm font-medium transition-colors hover:border-primary disabled:opacity-50"
              >
                {couponBusy ? "…" : coupon ? "Change" : "Apply"}
              </button>
            </div>
            {couponError && <p className="text-xs text-primary">{couponError}</p>}
            {coupon?.clamped && (
              <p className="text-xs text-muted">
                Discount capped — {money(MIN_CHARGE_CENTS_CLIENT, product.currency)} is the smallest
                charge a card can take.
              </p>
            )}
          </div>

          <div className="flex items-baseline justify-between border-t border-border pt-4">
            <span className="text-muted">Total now</span>
            <span className="font-display text-2xl">{money(totalNow, product.currency)}</span>
          </div>
          {chosenBump?.termsLabel && (
            <p className="-mt-2 text-sm text-muted">
              {chosenBump.headline}: {chosenBump.termsLabel}.
            </p>
          )}
          <p className="-mt-2 text-xs text-muted">
            Tax is calculated at your country&rsquo;s rate and shown on your receipt.
          </p>

          {bump && (
            <div ref={bumpRef}>
              <OrderBump view={bump} alt={bumpAlt} choice={bumpChoice} onChoose={setBumpChoice} />
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm text-primary">
              {error}
            </p>
          )}

          {/* The amount lives in the button so the thing being agreed to is on
              the thing being pressed — and it moves with the bump, so ticking
              the add-on visibly changes what you are about to pay. */}
          {/* Held, not disabled, while the add-on is unanswered. A disabled
              button cannot be clicked, so it can never say why it is not
              working — it just fails silently and the buyer leaves. This one
              looks inert, takes the click, and answers. */}
          <button
            type="submit"
            disabled={busy || !stripe}
            aria-disabled={bumpUnanswered || undefined}
            className={`group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-full bg-primary px-6 py-4 font-medium text-primary-fg transition-[transform,background-color,box-shadow,opacity,filter] duration-200 hover:bg-primary-hover hover:shadow-[0_14px_30px_-12px_color-mix(in_srgb,var(--primary)_70%,transparent)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100 ${
              bumpUnanswered ? "opacity-55 blur-[0.7px] hover:bg-primary hover:shadow-none" : ""
            }`}
          >
            {busy ? (
              <>
                <svg viewBox="0 0 24 24" aria-hidden className="size-4 animate-spin">
                  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
                  <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                Processing…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 fill-current opacity-90">
                  <path d="M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9h-2ZM9 7a3 3 0 1 1 6 0v2H9V7Z" />
                </svg>
                <span>Pay {money(totalNow, product.currency)}</span>
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="size-4 shrink-0 fill-current transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                >
                  <path d="M13 5l7 7-7 7-1.4-1.4 4.6-4.6H4v-2h12.2l-4.6-4.6L13 5Z" />
                </svg>
              </>
            )}
          </button>

          <TrustBlock />
        </div>
      </aside>
    </form>
  );
}

// Reassurance under the pay button, where hesitation actually happens.
//
// Every line here is a claim this store can actually keep, and each is true of
// the code as written: Stripe's Payment Element owns the card fields so no card
// number ever reaches our server or database; access is granted by finalizeOrder
// the moment payment succeeds; the refund window is the one the policy pages
// state. No borrowed security-vendor badges — a logo we have no relationship
// with is a lie, and the buyers who look closely are the ones who were already
// hesitating.
function TrustBlock() {
  const items = [
    {
      label: "Stripe secure",
      icon: "M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm0 6a2 2 0 0 1 2 2v1h.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5v-3a.5.5 0 0 1 .5-.5H10v-1a2 2 0 0 1 2-2Zm0 1a1 1 0 0 0-1 1v1h2v-1a1 1 0 0 0-1-1Z",
    },
    {
      label: "Card never stored",
      icon: "M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4H4V6h16v2Zm0 10H4v-6h16v6Z",
    },
    {
      label: "Instant access",
      icon: "M13 2 3 14h7l-1 8 11-13h-7l1-7Z",
    },
  ];

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      {/* Icon plus two or three words. The long-form reassurance that lived here
          was competing with the button it sits under: at the moment of paying,
          a paragraph is something to read rather than something that reassures. */}
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" aria-hidden className="size-3.5 shrink-0 fill-current text-navy">
              <path d={it.icon} />
            </svg>
            <span className="text-xs text-muted">{it.label}</span>
          </li>
        ))}
      </ul>
      {/* Kept deliberately: naming the terms and the withdrawal right at the
          point of payment is a disclosure obligation for EU/UK digital sales,
          not decoration. One line of fine print, not a badge. */}
      <p className="text-center text-[11px] text-muted">
        By paying you agree to our{" "}
        <a href="/terms" className="underline underline-offset-2 hover:text-fg">terms</a> and{" "}
        <a href="/refunds" className="underline underline-offset-2 hover:text-fg">refund policy</a>.
      </p>
    </div>
  );
}

const input =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-sm outline-none transition-colors focus:border-primary";

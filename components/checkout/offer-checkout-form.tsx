"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { startOffer } from "@/app/(store)/checkout/offer/actions";
import { OrderBump } from "@/components/checkout/order-bump";
import type { BumpChoice } from "@/lib/bump";

export type OfferSummary = {
  id: string;
  headline: string;
  description: string | null;
  chargeNowCents: number;
  /**
   * The offer's own trial, for when no way to pay has been picked yet. The
   * base a coupon's `trial_days` replaces — see `trialDays` below.
   */
  trialDays: number | null;
  /**
   * What it renews at, where it renews at all.
   *
   * The pieces rather than the finished sentence. It used to arrive as
   * `recurringNote`, built on the server from `offer.trialDays` — which meant
   * the one line the form shows before a price is picked went on naming the
   * price's trial after a code had replaced it.
   */
  recurring: { priceCents: number; interval: string | null } | null;
  acceptLabel: string;
  currency: string;
};

import { money } from "@/lib/money";
import { suggestEmail } from "@/lib/email-hint";
import { priceLabel, priceTerms, chargeNowCents, type OfferPrice } from "@/lib/offer-prices";
import { MIN_CHARGE_CENTS_CLIENT, type BumpSummary } from "@/components/checkout/checkout-types";
import { previewOfferCouponAction } from "@/app/(store)/checkout/offer/actions";
import { CheckoutSlots, type CheckoutSlotValue } from "@/components/checkout/slots";
import { usePublishTrialDays } from "@/components/checkout/trial";
import { CheckoutV2Layout } from "@/components/checkout/v2/layout";
import { stripeAppearance } from "@/components/checkout/v2/appearance";
import type { CheckoutSkin } from "@/lib/checkout-skin";
import type { CheckoutDesign } from "@/lib/checkout-design";

export function OfferCheckoutForm({
  offer,
  signedInEmail,
  publishableKey,
  prices = [],
  chosen = -1,
  bumpOptions = [],
  skin = "v1",
  termsUrl,
  earningsUrl,
  design,
}: {
  offer: OfferSummary;
  /** Null for a stranger — the form then asks who they are. */
  signedInEmail: string | null;
  publishableKey: string;
  /** Every way to pay. One or none means there is nothing to choose. */
  prices?: OfferPrice[];
  /** Preselected from the sales page. -1 when they arrived without choosing. */
  chosen?: number;
  /** Every way to buy the bump, in the order the placement stored them. */
  bumpOptions?: BumpSummary[];
  /** Which arrangement. See lib/checkout-skin.ts — v1 unless asked for. */
  skin?: CheckoutSkin;
  termsUrl?: string;
  earningsUrl?: string;
  design?: CheckoutDesign;
}) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  return (
    <Elements
      stripe={stripePromise}
      options={{
        // The safe starting guess, before a price is even known: nothing to
        // authorise yet, so there is no amount to give it. Inner's own effect
        // corrects this the moment a price is picked (or on mount, for a
        // preselected or single one) — this is only ever what's on screen
        // for the instant before that runs.
        mode: "setup",
        currency: offer.currency,
        appearance: stripeAppearance(skin, design?.buttonColor),
      }}
    >
      <Inner
        offer={offer}
        signedInEmail={signedInEmail}
        prices={prices}
        chosen={chosen}
        bumpOptions={bumpOptions}
        skin={skin}
        termsUrl={termsUrl}
        earningsUrl={earningsUrl}
        design={design}
      />
    </Elements>
  );
}

function Inner({
  offer,
  signedInEmail,
  prices,
  chosen,
  bumpOptions,
  skin,
  termsUrl,
  earningsUrl,
  design,
}: {
  offer: OfferSummary;
  signedInEmail: string | null;
  prices: OfferPrice[];
  chosen: number;
  /** Every way to buy the bump, in the order the placement stored them. */
  bumpOptions: BumpSummary[];
  skin: CheckoutSkin;
  termsUrl?: string;
  earningsUrl?: string;
  design?: CheckoutDesign;
}) {
  // Preselected from the sales page, and still changeable — somebody who
  // picked the yearly two pages ago should not have to pick it again, and
  // should not be stuck with it either.
  const [pick, setPick] = useState<number>(chosen >= 0 ? chosen : prices.length === 1 ? 0 : -1);
  const picked = pick >= 0 ? (prices[pick] ?? null) : null;
  // "none" until they tick it. An index once they have — the same shape the
  // price switch posts, because the server reads both as positions in a list
  // it rebuilt rather than as anything the browser named.
  const [bumpPick, setBumpPick] = useState<number | "none">("none");
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Asked for only when there is nobody signed in. A member's address comes
  // from the session and is never taken from this form.
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [emailHint, setEmailHint] = useState<string | null>(null);

  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<
    | {
        label: string;
        discountCents: number;
        clamped: boolean;
        recurringDiscount: boolean;
        /** Replaces the price's own trial. Null when the code says nothing. */
        trialDays: number | null;
      }
    | null
  >(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponOpen, setCouponOpen] = useState(false);

  async function applyCoupon(atPick: number = pick) {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);
    const res = await previewOfferCouponAction(offer.id, code, atPick >= 0 ? atPick : undefined);
    if (!res.ok) {
      setCoupon(null);
      setCouponError(res.error);
    } else {
      setCoupon(res);
    }
    setCouponBusy(false);
  }

  /**
   * Switching how you pay re-prices the code you already applied.
   *
   * A code can be scoped to one billing period. Leaving it on screen after a
   * switch to yearly showed the discount and "30 days free instead of 7" beside
   * a price it does not apply to — startOfferCheckout refuses it at the end, so
   * the buyer reads the promise, presses pay and is only then told no. It must
   * not silently persist and it must not silently apply: re-asking the server
   * either re-prices it against the new choice or drops it with the reason.
   */
  function choosePrice(i: number) {
    setPick(i);
    if (coupon) void applyCoupon(i);
  }

  // Recurring where the chosen price renews — and where nothing has been
  // chosen yet, from the offer's own note, which is the only signal this
  // component is given.
  //
  // Keyed on billingType, not interval: the CHECK constraints enforce
  // recurring -> interval but nothing forbids a one_time price carrying a
  // stray non-null interval (only the admin editor keeps that true today), and
  // the server (startOfferCheckout) branches on billingType alone. Reading
  // interval here would leave Elements in setup mode against such a row while
  // the server opened a PaymentIntent — exactly the mismatch this file's
  // effect exists to prevent.
  const isRecurring = picked ? picked.billingType === "recurring" : Boolean(offer.recurring);

  // A bump can only ride a one-time host's own PaymentIntent — a recurring
  // price opens a SetupIntent instead, which takes no money today, and
  // startOfferCheckout refuses the pairing outright. Offering a tickbox that
  // can only end in that refusal is worse than not offering one.
  const bumpAllowed = bumpOptions.length > 0 && !isRecurring;

  // Cleared, not just hidden — switching to a recurring price and back must
  // not resurrect a tick the buyer never re-confirmed on the price now
  // showing.
  useEffect(() => {
    if (isRecurring) setBumpPick("none");
  }, [isRecurring]);

  // order-bump answers "main" for a single-option bump reached through the
  // redesign's slot (its legacy alt/main pairing takes over whenever there is
  // only one option to show — see OrderBumpSlot in slots.tsx) and a plain
  // index everywhere else, including this file's own render below, which
  // always hands it the full list. Offers have no second slot for "alt" to
  // mean anything, so both answers collapse to the position they actually
  // name.
  function chooseBump(next: BumpChoice) {
    setBumpPick(typeof next === "number" ? next : next === "main" ? 0 : "none");
  }

  // "none" whenever the bump cannot actually be bought — the pay-time
  // backstop to the effect above, so a tick made under a one-time price can
  // never ride a switch to recurring into what gets shown as chosen or
  // posted to the server.
  const bumpChoice = bumpAllowed ? bumpPick : "none";
  const chosenBump = typeof bumpChoice === "number" ? (bumpOptions[bumpChoice] ?? null) : null;
  // Undiscounted: startOfferCheckout adds the bump AFTER discounting the
  // host, never before — see dueNow below.
  const bumpNowCents = chosenBump?.chargeNowCents ?? 0;

  // What is taken today, after any discount that applies today.
  //
  // On a subscription the coupon lands on the first REAL invoice — Stripe
  // applies it for the coupon's own duration — so today's figure is unchanged
  // and the saving is stated separately. Subtracting it here would promise a
  // reduction on a $0 trial charge that no invoice will ever show.
  const grossNow = picked ? chargeNowCents(picked) : offer.chargeNowCents;
  // The trial that will actually run. A code carrying `trial_days` replaces the
  // price's own — the same `coupon.trialDays ?? price.trialDays` the
  // subscription hands Stripe — so every sentence about the trial has to be
  // built with it, or the page promises seven days against a card getting 30.
  //
  // Worked out ONCE, here, because this is the only component that can see both
  // the code and the choice. The selling half of the page reads the answer
  // rather than deriving its own: two derivations off different inputs is how
  // the stage came to say seven beside a form saying thirty.
  const trialDays = coupon?.trialDays ?? (picked ? picked.trialDays : offer.trialDays);
  usePublishTrialDays(trialDays);
  // What it renews at, said before a price has been picked. The picked case has
  // its own sentence — `priceTerms` below — and both state `trialDays`.
  const recurringNote = offer.recurring
    ? `Then ${money(offer.recurring.priceCents, offer.currency)}/${offer.recurring.interval}${
        trialDays ? ` after your ${trialDays}-day trial` : ""
      }. Cancel anytime.`
    : null;
  // The bump rides in AFTER the host's own clamp, exactly how
  // startOfferCheckout builds the PaymentIntent's amount
  // (gross - discount + bumpNowCents) — a coupon that reached into the
  // bump's price here would show a total the server would never charge.
  const dueNow =
    (coupon && !isRecurring
      ? Math.max(MIN_CHARGE_CENTS_CLIENT, grossNow - coupon.discountCents)
      : grossNow) + bumpNowCents;

  /**
   * Keep Stripe's idea of the checkout in step with the page's — the same
   * reason checkout-form.tsx keeps this effect (its lines ~267-295): Elements
   * was created once, at mount, in "setup" mode with no amount, and nothing
   * here ever moved it, so a PaymentElement for a one-time offer rendered as
   * though nothing were owed and confirmPayment against it does not work.
   *
   * Mode follows `isRecurring`, not `dueNow > 0` the way the product form's
   * does: startOfferCheckout (lib/offer-checkout.ts) opens a PaymentIntent
   * only for `billingType === "one_time"` and a SetupIntent for every
   * recurring price, trial or not — a no-trial subscription's first charge is
   * its own invoice, not this intent, even though `dueNow` is its full price
   * for that price. Keying this off `dueNow` instead would put Elements in
   * "payment" mode for exactly that price while the server still opens a
   * SetupIntent — the same mismatch this effect exists to close, just on the
   * other billing type.
   *
   * `dueNow` still supplies the amount: it is the one figure this component
   * works out for what a PaymentIntent should ask for, and it is what "Due
   * today" already prints below — a second calculation here is how the two
   * end up disagreeing.
   *
   * `dueNow` already carries the bump. Ticking it changes what Apple Pay and
   * Google Pay quote and can change which methods Stripe offers at all, so
   * the amount here has to move the instant the tick does — this effect
   * already depends on `dueNow`, so nothing further had to change for that.
   */
  useEffect(() => {
    if (!elements) return;
    if (isRecurring) {
      void elements.update({ mode: "setup", currency: offer.currency, setupFutureUsage: "off_session" });
      return;
    }
    void elements.update({
      mode: "payment",
      amount: dueNow,
      currency: offer.currency,
      setupFutureUsage: "off_session",
    });
  }, [elements, isRecurring, dueNow, offer.currency]);

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

    const res = await startOffer(
      offer.id,
      pick >= 0 ? pick : undefined,
      // The code, never the amount. The server prices it again.
      coupon ? couponInput.trim() : null,
      // Read by the server ONLY when no session exists. A signed-in member's
      // identity comes from the session, so nothing typed here can buy in
      // somebody else's name.
      signedInEmail ? undefined : { email: email.trim(), fullName: fullName.trim() },
      bumpChoice,
    );
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }

    // A one-time offer takes money now, so the buyer confirms a payment while
    // they are here. A trial takes nothing today, so its card is saved and the
    // subscription bills itself. Same return_url either way — the route reads
    // whichever pair of query parameters Stripe sends back.
    const confirmParams = { return_url: `${window.location.origin}/checkout/offer/complete` };
    const { error: confirmError } =
      res.mode === "payment"
        ? await stripe.confirmPayment({ elements, clientSecret: res.clientSecret, confirmParams })
        : await stripe.confirmSetup({ elements, clientSecret: res.clientSecret, confirmParams });
    // Only reached if confirmation didn't redirect (i.e. something failed).
    if (confirmError) setError(confirmError.message ?? "Could not take payment");
    setBusy(false);
  }

  /**
   * The offer checkout, described in the same terms as the product one.
   *
   * The money above is untouched — same startOffer, same branch between
   * confirmPayment and confirmSetup. This only publishes what the form
   * already knows so the redesign's pieces can read it, which is what lets
   * ONE arrangement serve both halves of the store instead of two that drift.
   *
   * The fields an offer has no answer for are honestly empty: there is no
   * name to type and no email to collect for a signed-in buyer, and every
   * slot that asks for those draws nothing when they are absent. The bump is
   * a real answer now, not an absent one — see bumpAllowed above.
   */
  const slots: CheckoutSlotValue = {
    product: {
      slug: "",
      title: offer.headline,
      tagline: offer.description,
      // The list price of what they picked. What is taken TODAY is totalNow,
      // which on a trial is nothing — the two are different numbers and the
      // summary shows both.
      priceCents: picked ? picked.priceCents : offer.chargeNowCents,
      currency: offer.currency,
      coverUrl: null,
      prices,
    },
    signedInEmail,
    fullName,
    setFullName,
    email: signedInEmail ?? email,
    setEmail,
    emailHint,
    acceptEmailHint: () => {
      setEmail(emailHint ?? "");
      setEmailHint(null);
    },
    // Subscriptions carry Stripe's own automatic_tax, which reads the address
    // off the payment method — so this checkout has never had to ask, and the
    // redesign showing the country inside Stripe's box changes nothing here.
    country: "",
    setCountry: () => {},
    captureEmail: () => setEmailHint(suggestEmail(email.trim().toLowerCase())),
    prices,
    pricePick: pick >= 0 ? pick : null,
    setPricePick: choosePrice,
    // No separate "alt" slot for an offer's bump — see chooseBump above.
    bump: bumpAllowed ? (bumpOptions[0] ?? null) : null,
    bumpAlt: null,
    bumpOptions,
    bumpChoice,
    setBumpChoice: chooseBump,
    bumpRef: { current: null },
    chosenBump,
    bumpUnanswered: false,
    coupon,
    couponInput,
    setCouponInput: (v: string) => {
      setCouponInput(v);
      setCouponError(null);
    },
    couponBusy,
    couponError,
    applyCoupon: () => void applyCoupon(),
    totalNow: dueNow,
    busy,
    error,
    canPay: Boolean(stripe),
    notePaymentInfo: () => {},
    termsUrl,
    earningsUrl,
    design,
  };

  if (skin === "v2") {
    return (
      <CheckoutSlots value={slots}>
        <form onSubmit={onSubmit} className="flex flex-col gap-7">
          <CheckoutV2Layout />
        </form>
      </CheckoutSlots>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {/* Signed in already — shown so they can see which account this attaches
          to, but not editable: the session decides, not the form. */}
      {signedInEmail && (
        <div className="flex flex-col gap-2">
          <span className="kicker text-muted">Your account</span>
          <div className="rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-sm text-muted">
            {signedInEmail}
          </div>
        </div>
      )}

      {/* Above the payment methods, because what you are buying is a question
          that comes before how you would like to pay for it — and a choice
          underneath the card fields is one people meet after they have already
          decided they are finished. */}
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
                onChange={() => choosePrice(i)}
                className="size-[18px] shrink-0 cursor-pointer accent-[var(--primary)]"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-display font-semibold tabular-nums">
                  {priceLabel(p, offer.currency)}
                  {p.label.trim() && (
                    <span className="ml-2 text-[0.72rem] font-medium text-muted">{p.label.trim()}</span>
                  )}
                </span>
                {priceTerms(p, offer.currency, pick === i ? trialDays : null) && (
                  <span className="text-[0.76rem] text-muted">
                    {priceTerms(p, offer.currency, pick === i ? trialDays : null)}
                  </span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {/* Before the summary and well before the card: how you are buying the
          thing decides what the add-on beside it costs, and a decision that
          changes the total has to come before the total. Same placement the
          redesign's own OrderBumpSlot uses — see slots.tsx. */}
      {bumpAllowed && (
        <div className="flex flex-col gap-2">
          <span className="kicker text-muted">One more thing</span>
          <OrderBump view={bumpOptions[0]} options={bumpOptions} choice={bumpChoice} onChoose={chooseBump} />
        </div>
      )}

      {/* The same summary the product checkout carries, in the same place.
          It was missing here entirely, so the one page where somebody is
          confirming a subscription showed a total with nothing above it saying
          what the total was FOR. */}
      <div className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-6">
        <span className="kicker text-muted">Order summary</span>

        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="min-w-0 text-muted">{offer.headline}</span>
          {/* The recurring price where there is one to state, and nothing at
              all where there is not: an offer on a trial with no price list
              would otherwise print "$0" beside its name and "$0" again as the
              total, which reads as a free product rather than a trial. The
              renewal line under this box carries the real figure. */}
          {(picked || offer.chargeNowCents > 0) && (
            <span className="shrink-0">
              {money(picked ? picked.priceCents : offer.chargeNowCents, offer.currency)}
            </span>
          )}
        </div>

        {/* What it renews at, where that differs from what is taken today —
            which is every trial. Saying only "$0 due today" on a subscription
            is how a first renewal becomes a dispute. */}
        {picked && chargeNowCents(picked) !== picked.priceCents && (
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted">Due today</span>
            <span className="shrink-0">{money(chargeNowCents(picked), offer.currency)}</span>
          </div>
        )}

        {coupon && (
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="min-w-0 text-navy">{coupon.label}</span>
            <span className="shrink-0 text-navy">
              −{money(coupon.discountCents, offer.currency)}
            </span>
          </div>
        )}

        {/* The bump's own line, named rather than folded silently into the
            total — same reason the coupon gets one. The NAME, not the pitch:
            an order line is a record of what is being bought, not the advert
            for it (see buildBumpView's own `name` field). */}
        {chosenBump && (
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="min-w-0 text-muted">{chosenBump.name}</span>
            <span className="shrink-0">{money(chosenBump.chargeNowCents, offer.currency)}</span>
          </div>
        )}

        {/* Sized inline for the same reason the product checkout's is: the
            store writes `:root p` for its sales pages and it beats every class
            here, which turned this footnote into a paragraph. */}
        <p className="text-xs text-muted" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
          Tax is calculated at your country&rsquo;s rate and shown on your receipt.
        </p>

        {/* Folded away until asked for, the same as the product checkout. An
            always-open field on a confirmation page is an empty box asking a
            question most buyers cannot answer. */}
        {couponOpen || coupon || couponError ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-border bg-surface pr-1 transition-colors focus-within:border-primary">
              <input
                type="text"
                value={couponInput}
                onChange={(e) => {
                  setCouponInput(e.target.value);
                  setCouponError(null);
                }}
                // Enter must not submit the payment form. Pressing it to apply
                // a code and having a card charged instead is how a purchase
                // becomes a chargeback.
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
                autoFocus={couponOpen}
                className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-sm uppercase outline-none placeholder:normal-case placeholder:text-muted"
              />
              <button
                type="button"
                onClick={() => void applyCoupon()}
                disabled={couponBusy || !couponInput.trim()}
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
              >
                {couponBusy ? "…" : coupon ? "Change" : "Apply"}
              </button>
            </div>
            {couponError && (
              <p className="text-xs text-primary" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
                {couponError}
              </p>
            )}
            {/* Said out loud, because a subscription is the one place where "20%
                off" can mean either one bill or every bill, and the buyer finds
                out on the second one. */}
            {coupon && isRecurring && (
              <p className="text-xs text-muted" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
                {coupon.recurringDiscount
                  ? "Applies to this payment and the renewals after it."
                  : "Applies to your first payment. Renewals are at the full price."}
              </p>
            )}
            {coupon?.clamped && (
              <p className="text-xs text-muted" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
                Discount capped — {money(MIN_CHARGE_CENTS_CLIENT, offer.currency)} is the smallest
                charge a card can take.
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCouponOpen(true)}
            className="self-start text-sm text-muted underline underline-offset-4 transition-colors hover:text-fg"
            style={{ fontSize: "0.875rem", lineHeight: 1.5 }}
          >
            Have a discount code?
          </button>
        )}

        <div className="flex items-baseline justify-between border-t border-border pt-4">
          <span className="text-muted">Due today</span>
          <span className="font-display text-2xl">{money(dueNow, offer.currency)}</span>
        </div>
      </div>
      {picked
        ? priceTerms(picked, offer.currency, trialDays) && (
            <p className="-mt-3 text-sm text-muted" style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
              {priceTerms(picked, offer.currency, trialDays)}
            </p>
          )
        : recurringNote && (
            <p className="-mt-3 text-sm text-muted" style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
              {recurringNote}
            </p>
          )}

      {/* The card fields come after the summary, never before it.
          What am I buying, what does it cost, then how do I pay — that is the
          order the questions arrive in, and a form that asks for a card above
          the total is asking somebody to commit before it has said to what. */}
      <fieldset className="flex flex-col gap-3">
        <legend className="kicker mb-2 text-muted">Payment method</legend>
        <PaymentElement />
      </fieldset>

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
        {busy ? "Processing…" : offer.acceptLabel}
      </button>
    </form>
  );
}

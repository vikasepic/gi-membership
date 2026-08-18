"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements } from "@stripe/react-stripe-js";
import { startCheckout, previewCoupon, captureAbandonedCart } from "@/app/(store)/checkout/actions";
import { track } from "@/components/analytics";
import { eventIdFor } from "@/lib/analytics/events";
import { needsAnswer, type BumpChoice } from "@/lib/bump";

type AppliedDiscount = { label: string; discountCents: number; clamped: boolean };

import { suggestEmail } from "@/lib/email-hint";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { CheckoutSlots, DefaultCheckoutLayout, type CheckoutSlotValue } from "@/components/checkout/slots";
import { CheckoutV2Layout } from "@/components/checkout/v2/layout";
import { stripeAppearance } from "@/components/checkout/v2/appearance";
import type { CheckoutSkin } from "@/lib/checkout-skin";
import type { CheckoutDesign } from "@/lib/checkout-design";
import type { Block } from "@/lib/blocks";
import {
  COUNTRY_REQUIRED,
  type BumpSummary,
  type CheckoutProduct,
} from "@/components/checkout/checkout-types";

// Re-exported rather than moved outright: several call sites and tests import
// these from here, and a rename that touches the money path to save one line of
// indirection is not worth making.
export type { BumpSummary, CheckoutProduct } from "@/components/checkout/checkout-types";

export function CheckoutForm({
  product,
  bump,
  bumpAlt,
  bumpOptions = [],
  publishableKey,
  signedInEmail,
  defaultCountry,
  layout,
  termsUrl,
  skin = "v1",
  design,
}: {
  product: CheckoutProduct;
  bump: BumpSummary | null;
  bumpAlt?: BumpSummary | null;
  /** Every price this placement shows, in order. The form posts an index into it. */
  bumpOptions?: BumpSummary[];
  publishableKey: string;
  /**
   * The checkout the store laid out, already checked.
   *
   * Absent — a store that has never opened the editor, or one whose saved
   * layout was missing a part a checkout cannot do without — and the
   * arrangement that shipped renders instead. Never a page that cannot take
   * money. See lib/checkout-layout.ts.
   */
  layout?: Block[] | null;
  /** The store's published terms, for the line under the pay button. */
  termsUrl?: string;
  // Present when a member is already signed in — we then ask for nothing but
  // payment, since we already know who they are.
  signedInEmail?: string | null;
  defaultCountry?: string | null;
  /** Which arrangement. See lib/checkout-skin.ts — v1 unless asked for. */
  skin?: CheckoutSkin;
  /** What the store switched off, and in what colour. */
  design?: CheckoutDesign;
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
        appearance: stripeAppearance(skin, design?.buttonColor),
      }}
    >
      <Inner
        product={product}
        bump={bump}
        bumpAlt={bumpAlt ?? null}
        bumpOptions={bumpOptions}
        signedInEmail={signedInEmail ?? null}
        defaultCountry={defaultCountry ?? ""}
        layout={layout ?? null}
        termsUrl={termsUrl}
        skin={skin}
        design={design}
      />
    </Elements>
  );
}

function Inner({
  product,
  bump,
  signedInEmail,
  bumpAlt,
  bumpOptions = [],
  defaultCountry,
  layout,
  termsUrl,
  skin = "v1",
  design,
}: {
  product: CheckoutProduct;
  bump: BumpSummary | null;
  /** The bump's second billing option, when it has one. */
  bumpAlt: BumpSummary | null;
  /** Every price this placement shows, in order. The form posts an index into it. */
  bumpOptions?: BumpSummary[];
  signedInEmail: string | null;
  defaultCountry: string;
  layout: Block[] | null;
  termsUrl?: string;
  skin?: CheckoutSkin;
  design?: CheckoutDesign;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState(defaultCountry);
  // The redesign hides our country select and lets Stripe ask. This turns it
  // back on for the one case Stripe cannot answer — see onSubmit.
  const [askCountry, setAskCountry] = useState(false);
  // Which of the bump's prices was taken, if any.
  //
  // Every way to buy the bump. A ticked price list wins; the old two-offer
  // pairing is folded in behind it so one piece of code renders both.
  const options = bumpOptions.length > 1 ? bumpOptions : bumpAlt && bump ? [bump, bumpAlt] : [];
  // null is "has not answered yet" and is NOT the same as "none" — with a
  // choice on the card nothing starts selected, so declining is a thing
  // somebody does rather than a thing that happens to them by not reading. One
  // option has nothing to answer: an unticked box IS "none".
  const [bumpChoice, setBumpChoice] = useState<BumpChoice | null>(options.length > 1 ? null : "none");
  const bumpUnanswered = needsAnswer(options.length, bumpChoice);
  const bumpRef = useRef<HTMLDivElement>(null);
  const chosenBump =
    typeof bumpChoice === "number"
      ? (options[bumpChoice] ?? null)
      : bumpChoice === "alt"
        ? bumpAlt
        : bumpChoice === "main"
          ? bump
          : null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Which address we have already reported, so re-focusing the field or
  // tabbing back through the form does not fire again for the same person.
  const capturedEmail = useRef<string | null>(null);
  // The buffered lead is keyed on address AND name, because the name usually
  // arrives after the address: someone who clicks straight into Email, tabs
  // out, then fills their name would otherwise be forwarded to ActiveCampaign
  // with no first name at all. The pixel above still fires once per address.
  const bufferedLead = useRef<string | null>(null);
  const startedCheckout = useRef(false);
  const enteredPayment = useRef(false);

  /** First interaction with the card fields, once per checkout. */
  function notePaymentInfo() {
    if (enteredPayment.current) return;
    enteredPayment.current = true;
    track(
      "AddPaymentInfo",
      { value: totalNowRef.current / 100, currency: product.currency.toUpperCase() },
      eventIdFor("AddPaymentInfo"),
      { email: signedInEmail ?? (email.trim().toLowerCase() || null) },
    );
  }

  // The moment the checkout is on screen with a price on it. Once per mount:
  // a re-render that reported again would halve every conversion rate built
  // on top of it.
  useEffect(() => {
    if (startedCheckout.current) return;
    startedCheckout.current = true;
    track(
      "InitiateCheckout",
      {
        value: product.priceCents / 100,
        currency: product.currency.toUpperCase(),
        content_ids: [product.slug],
      },
      eventIdFor("InitiateCheckout"),
      { email: signedInEmail ?? null },
    );
  }, [product.slug, product.priceCents, product.currency]);
  const [emailHint, setEmailHint] = useState<string | null>(null);

  function captureEmail() {
    const value = email.trim().toLowerCase();
    setEmailHint(suggestEmail(value));
    if (!value || !value.includes("@")) return;
    // No Lead event here.
    //
    // Typing an address into a checkout is not a lead — it is the middle of a
    // purchase. Firing one on every blur put three Leads in front of one buyer
    // who was about to send a Purchase anyway, and taught the ad platform to
    // optimise for people who reach the email field rather than for people who
    // pay. The abandoned-cart capture below still runs; that is what the
    // address is genuinely useful for.
    capturedEmail.current = value;
    const name = fullName.trim();
    const key = `${value}|${name}`;
    if (bufferedLead.current === key) return;
    bufferedLead.current = key;
    // Not awaited: this only buffers the address for an abandoned-cart email.
    // The buyer must never wait on it or see it fail.
    void captureAbandonedCart(product.slug, value, name || undefined);
  }

  // Which way to buy the product itself. Null where it has only one, which is
  // every product until somebody adds a second — and then the form asks.
  const [pricePick, setPricePick] = useState<number | null>(
    (product.prices?.length ?? 0) > 1 ? null : 0,
  );
  const chosenPrice = product.prices?.[pricePick ?? 0] ?? null;
  // More than one way to buy and none of them ticked. Same rule as the bump:
  // the page must not take money for the option that happens to be first.
  const priceUnanswered = (product.prices?.length ?? 0) > 1 && pricePick === null;
  const priceRef = useRef<HTMLFieldSetElement>(null);

  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<AppliedDiscount | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const bumpNow = chosenBump?.chargeNowCents ?? 0;
  const discount = coupon?.discountCents ?? 0;
  // What the chosen way to pay takes TODAY — nothing, on a trial. The product's
  // own price_cents is the headline and only right when nothing was chosen.
  const baseNow = chosenPrice
    ? chosenPrice.trialDays && chosenPrice.billingType === "recurring"
      ? 0
      : chosenPrice.priceCents
    : product.priceCents;
  const totalNow = baseNow - discount + bumpNow;
  // Held in a ref so the payment-info callback reads today's total without
  // being rebuilt — and re-registered on the Stripe element — every time the
  // bump or a coupon changes it.
  const totalNowRef = useRef(totalNow);
  totalNowRef.current = totalNow;

  /**
   * Keep Stripe's idea of the total in step with the page's.
   *
   * `Elements` was created with the product's headline price and never told
   * about anything after it — so ticking a bump, applying a coupon or choosing
   * the monthly changed the figure on the button and left Stripe holding the
   * old one. That figure is not decoration: it is what the Google Pay and Apple
   * Pay sheets show, and it decides which methods Stripe offers at all. A
   * wallet quoting a price the buyer did not agree to is the worst version of
   * this bug, because it is the one that completes.
   *
   * Mode moves with it. Nothing due today means the server is making a
   * SetupIntent — a $0 PaymentIntent is not a thing Stripe will create — and an
   * Elements left in payment mode is a wallet offering to charge for a free
   * trial.
   */
  useEffect(() => {
    if (!elements) return;
    if (totalNow <= 0) {
      void elements.update({ mode: "setup", currency: product.currency, setupFutureUsage: "off_session" });
      return;
    }
    void elements.update({
      mode: "payment",
      amount: totalNow,
      currency: product.currency,
      setupFutureUsage: "off_session",
    });
  }, [elements, totalNow, product.currency]);

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

  /**
   * The bump decision, reported as it is made.
   *
   * Until now the only trace of a bump was inside the eventual Purchase, folded
   * into one total — so "how many people are shown this and take it" was
   * unanswerable, and a bump nobody ever ticked looked identical to one nobody
   * was ever shown.
   *
   * Both shapes go through here: the single tickbox answers "main"/"none" and a
   * list of prices answers with an index, and the value reported is whatever
   * that resolves to rather than the offer's headline price — a bump taken on a
   * trial is $0 today, and reporting the sticker price would invent revenue.
   *
   * Fired on every change, including changing your mind. That is deliberate:
   * the last event before a Purchase is the decision that stood, and the ones
   * before it are the hesitation, which is the more interesting number.
   */
  function chooseBump(next: BumpChoice) {
    setBumpChoice(next);
    const taken =
      typeof next === "number"
        ? (options[next] ?? null)
        : next === "alt"
          ? bumpAlt
          : next === "main"
            ? bump
            : null;
    const currency = product.currency.toUpperCase();
    if (taken) {
      track("BumpSelected", {
        content_name: taken.headline,
        content_ids: [product.slug],
        value: taken.chargeNowCents / 100,
        currency,
        // Which of the ways to pay, for a bump offering more than one. The
        // index is what the server is sent, so this is the same answer.
        variant: typeof next === "number" ? next : next,
      });
    } else if (bump) {
      // "No thanks". Only where there was something to decline — a page with no
      // bump must not report a decline nobody was offered.
      track("BumpDeclined", { content_name: bump.headline, content_ids: [product.slug], currency });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // Asked before the card is touched. Stripe validating the card first and
    // THEN being told to pick an add-on is two rounds of correction for one
    // form, and the second one arrives after the slow part.
    if (priceUnanswered) {
      setError("Choose how you want to pay to continue.");
      priceRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      priceRef.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
      return;
    }
    if (bumpUnanswered) {
      setError("Choose one of the options above to continue — including “No thanks”.");
      bumpRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      bumpRef.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
      return;
    }
    if (!stripe || !elements) return;
    // Belt and braces: a wallet (Apple Pay, Link) can complete without the
    // card fields ever being touched, so the event would otherwise never fire
    // for the buyers who convert best.
    notePaymentInfo();
    setBusy(true);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Check your card details");
      setBusy(false);
      return;
    }

    // A signed-in member sends no credentials; the server takes them from the
    // session, so nothing here can buy in someone else's name.
    // Stripe collects the country inside its own form on the redesign — but a
    // wallet completes without that form ever being filled in, so this is the
    // last chance to fall back to what we already knew about this buyer.
    const billingCountry = country || defaultCountry || "";

    const res = await startCheckout({
      productSlug: product.slug,
      ...(signedInEmail ? {} : { email, fullName }),
      // The code, never the amount: the server prices it again.
      couponCode: coupon ? couponInput.trim() : null,
      // The INDEX of the way to pay they picked, never its price. The server
      // rebuilds the same list and takes this position in it.
      priceChoice: pricePick ?? undefined,
      bumpChoice: bumpChoice ?? "none",
      // What this page actually promised. Only ever used to refuse: an
      // anonymous buyer is shown a trial we cannot yet know they have used,
      // and charging them full price for something labelled free would be
      // the deception this whole feature exists to avoid.
      bumpTrialShown: (chosenBump?.chargeNowCents ?? null) === 0,
      country: billingCountry,
    });
    if (!res.ok) {
      // We could not work out where they are, and the field that would have
      // asked is hidden because Stripe's own form was doing it. Show ours —
      // a buyer who cannot answer the question is a buyer who cannot pay.
      if (res.error === COUNTRY_REQUIRED) setAskCountry(true);
      setError(res.error);
      setBusy(false);
      return;
    }

    // Which object to confirm is the server's answer, not a guess. A recurring
    // way to pay charges nothing today, so there is a SetupIntent to confirm
    // rather than a payment — and confirming the wrong one fails with a message
    // about a client secret that tells the buyer nothing.
    const confirmParams = { return_url: `${window.location.origin}/checkout/complete` };
    const { error: payError } =
      res.mode === "setup"
        ? await stripe.confirmSetup({ elements, clientSecret: res.clientSecret, confirmParams })
        : await stripe.confirmPayment({ elements, clientSecret: res.clientSecret, confirmParams });
    // Only reached if confirmation didn't redirect (i.e. an error occurred).
    if (payError) setError(payError.message ?? "Payment failed");
    setBusy(false);
  }

  const slots: CheckoutSlotValue = {
    product,
    signedInEmail,
    fullName,
    setFullName,
    email,
    setEmail,
    emailHint,
    acceptEmailHint: () => {
      setEmail(emailHint ?? "");
      setEmailHint(null);
      capturedEmail.current = null;
    },
    country,
    setCountry,
    captureEmail,
    prices: product.prices ?? [],
    pricePick,
    setPricePick,
    bump,
    bumpAlt,
    bumpOptions,
    bumpChoice,
    setBumpChoice: chooseBump,
    bumpRef,
    chosenBump,
    bumpUnanswered,
    priceUnanswered,
    priceRef,
    coupon,
    couponInput,
    setCouponInput: (v: string) => {
      setCouponInput(v);
      setCouponError(null);
    },
    couponBusy,
    couponError,
    applyCoupon: () => void applyCoupon(),
    totalNow,
    busy,
    error,
    canPay: Boolean(stripe),
    notePaymentInfo,
    termsUrl,
    askCountry,
    design,
  };

  return (
    /* One form, whatever the layout. Every piece of this page is a component
       that reads the form out of context — see slots.tsx — so a store that has
       laid the checkout out itself and a store that never has run the same
       code in a different order.

       The saved layout is trusted only after it has been checked for the parts
       a checkout cannot do without. That check is not here: it runs on the
       server before this ever renders, and what arrives is either a layout with
       card fields, a total and a button in it, or nothing. See
       lib/checkout-layout.ts. */
    <CheckoutSlots value={slots}>
      <form onSubmit={onSubmit} className="flex flex-col gap-7">
        {/* The redesign wins over a store-built layout, because asking for it
            is an explicit "show me the new one" and a saved arrangement of the
            old pieces is not an answer to that. */}
        {skin === "v2" ? (
          <CheckoutV2Layout />
        ) : layout && layout.length > 0 ? (
          <Blocks blocks={layout} theme={bandTheme("paper")} />
        ) : (
          <DefaultCheckoutLayout />
        )}
      </form>
    </CheckoutSlots>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { startCheckout, previewCoupon, captureAbandonedCart } from "@/app/(store)/checkout/actions";
import { OrderBump } from "@/components/checkout/order-bump";
import { track } from "@/components/analytics";
import { eventIdFor } from "@/lib/analytics/events";
import { needsAnswer, type BumpChoice } from "@/lib/bump";
import type { BumpView } from "@/lib/bump";

type AppliedDiscount = { label: string; discountCents: number; clamped: boolean };

import { money } from "@/lib/money";
import { suggestEmail } from "@/lib/email-hint";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { CheckoutSlots, DefaultCheckoutLayout, type CheckoutSlotValue } from "@/components/checkout/slots";
import type { Block } from "@/lib/blocks";
import {
  COUNTRIES,
  MIN_CHARGE_CENTS_CLIENT,
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
        bumpOptions={bumpOptions}
        signedInEmail={signedInEmail ?? null}
        defaultCountry={defaultCountry ?? ""}
        layout={layout ?? null}
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
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState(defaultCountry);
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
    );
  }, [product.slug, product.priceCents, product.currency]);
  const [emailHint, setEmailHint] = useState<string | null>(null);

  function captureEmail() {
    const value = email.trim().toLowerCase();
    setEmailHint(suggestEmail(value));
    if (!value || !value.includes("@")) return;
    if (capturedEmail.current !== value) {
      capturedEmail.current = value;
      // An address on a checkout is a lead whether or not they go on to buy —
      // and it is the last thing many of them do.
      track("Lead", { content_ids: [product.slug] }, eventIdFor("Lead", value));
    }
    const name = fullName.trim();
    const key = `${value}|${name}`;
    if (bufferedLead.current === key) return;
    bufferedLead.current = key;
    // Not awaited: this only buffers the address for an abandoned-cart email.
    // The buyer must never wait on it or see it fail.
    void captureAbandonedCart(product.slug, value, name || undefined);
  }

  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<AppliedDiscount | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  const bumpNow = chosenBump?.chargeNowCents ?? 0;
  const discount = coupon?.discountCents ?? 0;
  const totalNow = product.priceCents - discount + bumpNow;
  // Held in a ref so the payment-info callback reads today's total without
  // being rebuilt — and re-registered on the Stripe element — every time the
  // bump or a coupon changes it.
  const totalNowRef = useRef(totalNow);
  totalNowRef.current = totalNow;

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
    const res = await startCheckout({
      productSlug: product.slug,
      ...(signedInEmail ? {} : { email, fullName }),
      // The code, never the amount: the server prices it again.
      couponCode: coupon ? couponInput.trim() : null,
      bumpChoice: bumpChoice ?? "none",
      // What this page actually promised. Only ever used to refuse: an
      // anonymous buyer is shown a trial we cannot yet know they have used,
      // and charging them full price for something labelled free would be
      // the deception this whole feature exists to avoid.
      bumpTrialShown: (chosenBump?.chargeNowCents ?? null) === 0,
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
    bump,
    bumpAlt,
    bumpOptions,
    bumpChoice,
    setBumpChoice: chooseBump,
    bumpRef,
    chosenBump,
    bumpUnanswered,
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
        {layout && layout.length > 0 ? (
          <Blocks blocks={layout} theme={bandTheme("paper")} />
        ) : (
          <DefaultCheckoutLayout />
        )}
      </form>
    </CheckoutSlots>
  );
}

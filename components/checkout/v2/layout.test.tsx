// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { OfferPrice } from "@/lib/offer-prices";
import type { CheckoutSlotValue } from "@/components/checkout/slots";

/**
 * The redesign, mounted.
 *
 * Reading the JSX cannot answer the questions that matter here, because the
 * answers are conditional: does the country field come back when Stripe could
 * not supply one, does a two-plan offer show the saving it actually gives, and
 * are the three parts a checkout cannot do without — somewhere to type a card,
 * a total, a button — all still on the page.
 *
 * Stripe's element is replaced by a marker. The real one is an iframe that
 * needs a live Elements provider and a network; what this needs to know is
 * that the slot rendered it and with which options.
 */

const captured: { options?: unknown } = {};
vi.mock("@stripe/react-stripe-js", () => ({
  PaymentElement: (props: Record<string, unknown>) => {
    captured.options = props.options;
    return <div data-testid="payment-element" />;
  },
}));

const { CheckoutSlots } = await import("@/components/checkout/slots");
const { CheckoutV2Layout } = await import("@/components/checkout/v2/layout");

const price = (over: Partial<OfferPrice>): OfferPrice => ({
  id: "p1",
  label: "",
  billingType: "recurring",
  interval: "month",
  intervalCount: 1,
  trialDays: 7,
  priceCents: 2900,
  compareAtCents: null,
  archived: false,
  ...over,
});

const noop = () => {};

function slots(over: Partial<CheckoutSlotValue> = {}): CheckoutSlotValue {
  return {
    product: { slug: "guide", title: "The Field Guide", tagline: null, priceCents: 2700, currency: "usd" },
    signedInEmail: null,
    fullName: "",
    setFullName: noop,
    email: "",
    setEmail: noop,
    emailHint: null,
    acceptEmailHint: noop,
    country: "",
    setCountry: noop,
    captureEmail: noop,
    prices: [],
    pricePick: null,
    setPricePick: noop,
    bump: null,
    bumpAlt: null,
    bumpOptions: [],
    bumpChoice: "none",
    setBumpChoice: noop,
    bumpRef: { current: null },
    chosenBump: null,
    bumpUnanswered: false,
    coupon: null,
    couponInput: "",
    setCouponInput: noop,
    couponBusy: false,
    couponError: null,
    applyCoupon: noop,
    totalNow: 2700,
    busy: false,
    error: null,
    canPay: true,
    notePaymentInfo: noop,
    ...over,
  };
}

let host: HTMLDivElement | null = null;
function render(value: CheckoutSlotValue): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host!).render(
      <CheckoutSlots value={value}>
        <CheckoutV2Layout />
      </CheckoutSlots>,
    );
  });
  return host;
}

afterEach(() => {
  host?.remove();
  host = null;
});

describe("the redesigned checkout", () => {
  it("can still take money", () => {
    // The invariant behind letting a layout be swapped at all: somewhere to
    // type a card, what it comes to, and something to press. A design that
    // loses any of the three is a page that cannot sell.
    const el = render(slots());
    expect(el.querySelector('[data-testid="payment-element"]')).not.toBeNull();
    expect(el.textContent).toContain("$27");
    expect(el.querySelector('button[type="submit"]')).not.toBeNull();
  });

  it("asks Stripe for the billing country instead of asking twice", () => {
    const el = render(slots());
    // Ours is gone…
    expect(el.querySelector('select[aria-label="Billing country"]')).toBeNull();
    // …because theirs is collecting it.
    const options = captured.options as { fields?: { billingDetails?: { address?: { country?: string } } } };
    expect(options.fields?.billingDetails?.address?.country).toBe("auto");
  });

  it("brings our country field back when Stripe could not supply one", () => {
    // A wallet completes without ever showing Stripe's card form, so there is
    // no country in it. Without this the buyer meets an error about a field
    // they cannot see and the sale is lost at the last step.
    const el = render(slots({ askCountry: true }));
    expect(el.querySelector('select[aria-label="Billing country"]')).not.toBeNull();
  });

  it("offers the wallets rather than leaving them to chance", () => {
    render(slots());
    const options = captured.options as { wallets?: Record<string, string> };
    expect(options.wallets).toEqual({ applePay: "auto", googlePay: "auto", link: "auto" });
  });

  it("states the saving it actually gives, and nothing when there is none", () => {
    // $199/year against $29/month is a real saving and the badge is arithmetic,
    // not a typed-in number — so it cannot outlive the next price change.
    const el = render(
      slots({
        prices: [
          price({ id: "yr", interval: "year", priceCents: 19900 }),
          price({ id: "mo", interval: "month", priceCents: 2900 }),
        ],
        pricePick: 0,
        totalNow: 0,
      }),
    );
    expect(el.textContent).toMatch(/save 4[0-9]%/i);
    // And the cheaper one is not badged against itself.
    expect(el.textContent!.match(/save \d+%/gi)!.length).toBe(1);
  });

  it("says what happens after a free trial, beside what is due today", () => {
    // "$0 due today" on a subscription with no renewal line beside it is how a
    // first charge becomes a chargeback.
    const el = render(
      slots({
        prices: [price({ id: "mo" }), price({ id: "yr", interval: "year", priceCents: 19900 })],
        pricePick: 0,
        totalNow: 0,
      }),
    );
    expect(el.textContent).toContain("Due today");
    expect(el.textContent).toContain("$0");
    expect(el.textContent).toMatch(/7 days free, then \$29 every month/i);
  });

  it("holds the pay button until a plan has actually been chosen", () => {
    // Nothing is preselected when there is a real choice, but the button was
    // still quoting the first price — so "Pay $49" was pressable with no radio
    // ticked and the server charged whatever happened to be at the top.
    const two = [price({ id: "mo" }), price({ id: "yr", interval: "year", priceCents: 19900 })];
    const held = render(slots({ prices: two, pricePick: null, priceUnanswered: true }));
    expect(held.querySelector("button[type=submit]")!.getAttribute("aria-disabled")).toBe("true");

    const answered = render(slots({ prices: two, pricePick: 1, priceUnanswered: false }));
    expect(answered.querySelector("button[type=submit]")!.getAttribute("aria-disabled")).toBeNull();
  });

  it("does not number the steps for someone already signed in", () => {
    // There is no "where should we send it" when the account is known, and a
    // step 1 nobody has to do makes step 2 look like there is one missing.
    const known = render(slots({ signedInEmail: "buyer@example.com" }));
    expect(known.textContent).not.toContain("Where should we send it?");
    expect(known.textContent).toContain("buyer@example.com");
  });

  it("numbers them for a buyer we do not know yet", () => {
    const el = render(slots());
    expect(el.textContent).toContain("Where should we send it?");
  });
});

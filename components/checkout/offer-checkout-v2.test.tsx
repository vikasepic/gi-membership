// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { OfferPrice } from "@/lib/offer-prices";
import { buildBumpView } from "@/lib/bump";

/**
 * The offer checkout, on the redesign.
 *
 * This is the half that was rewired: the offer form used to be its own page of
 * JSX with its own summary, its own coupon panel and its own pay button, and it
 * now publishes what it knows so the SAME arrangement the product checkout uses
 * can render it. What has to be proved is that the rewire did not lose
 * anything a subscription checkout is not allowed to lose — the account it
 * attaches to, the plan being bought, what is due today, and what happens after
 * the trial — and that asking for nothing still gets the checkout that ships.
 *
 * Stripe is replaced throughout: the real Elements needs a publishable key and
 * a network, and none of what is asserted here depends on it.
 */

vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve(null) }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({}),
  useElements: () => ({ submit: async () => ({}), update: async () => {} }),
}));
vi.mock("@/app/(store)/checkout/offer/actions", () => ({
  startOffer: async () => ({ ok: false, error: "not in a test" }),
  previewOfferCouponAction: async () => ({ ok: false, error: "no" }),
}));

const { OfferCheckoutForm } = await import("@/components/checkout/offer-checkout-form");

const price = (over: Partial<OfferPrice>): OfferPrice => ({
  id: "p",
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

const prices = [price({ id: "mo" }), price({ id: "yr", interval: "year", priceCents: 19900 })];

const offer = {
  id: "o1",
  headline: "Build funnels that actually convert",
  description: "Pages, checkouts and follow-up in one place.",
  chargeNowCents: 0,
  trialDays: 7,
  recurring: { priceCents: 2900, interval: "month" },
  acceptLabel: "Start my trial",
  currency: "usd",
};

let host: HTMLDivElement | null = null;
function render(node: React.ReactElement): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host!).render(node);
  });
  return host;
}
afterEach(() => {
  host?.remove();
  host = null;
});

describe("an offer bought on the redesign", () => {
  it("keeps everything a subscription checkout may not lose", () => {
    const el = render(
      <OfferCheckoutForm
        offer={offer}
        signedInEmail="member@example.com"
        publishableKey="pk_test"
        prices={prices}
        chosen={1}
        skin="v2"
      />,
    );
    const text = el.textContent ?? "";

    // Whose subscription this becomes.
    expect(text).toContain("member@example.com");
    // Which plan, chosen on the way here and still changeable.
    expect(el.querySelectorAll('input[name="way-to-buy"]').length).toBe(2);
    expect((el.querySelectorAll('input[name="way-to-buy"]')[1] as HTMLInputElement).checked).toBe(true);
    // Nothing today…
    expect(text).toContain("Due today");
    // …and what happens after, which is the line that stops a dispute.
    expect(text).toMatch(/7 days free, then \$199 every year/i);
    // Somewhere to put a card, and something to press.
    expect(el.querySelector('[data-testid="payment-element"]')).not.toBeNull();
    expect(el.querySelector("button[type=submit]")).not.toBeNull();
    // The discount code is still reachable.
    expect(text).toContain("Have a discount code?");
  });

  it("prices the yearly against the monthly without being told the answer", () => {
    const el = render(
      <OfferCheckoutForm offer={offer} signedInEmail="m@e.com" publishableKey="pk" prices={prices} chosen={1} skin="v2" />,
    );
    // $199/year against $29/month, per day. Derived, so a price change moves it.
    expect(el.textContent).toMatch(/save 4[0-9]%/i);
  });

  it("lets a stranger buy it", () => {
    // The whole point of the change. This checkout used to redirect anyone
    // without a session to /login, which put a wall in front of every public
    // offer sales page — an ad click landing on a price and a demand for an
    // account before it would take the money.
    const el = render(
      <OfferCheckoutForm offer={offer} signedInEmail={null} publishableKey="pk" prices={prices} chosen={1} skin="v2" />,
    );
    const text = el.textContent ?? "";
    // Asked who they are…
    expect(el.querySelector('input[aria-label="Full name"]')).not.toBeNull();
    expect(el.querySelector('input[aria-label="Email"]')).not.toBeNull();
    // …and no account row, because there is no account yet.
    expect(text).not.toContain("Your account");
    // Still a complete checkout.
    expect(el.querySelector('[data-testid="payment-element"]')).not.toBeNull();
    expect(el.querySelector("button[type=submit]")).not.toBeNull();
  });

  it("shows the bump through the same slot the product checkout uses, and hides it once the price is recurring", () => {
    // The redesign gets the bump for free through OrderBumpSlot — nothing in
    // v2/layout.tsx changed for this feature — so what has to be proved here
    // is that OfferCheckoutForm feeds it the right values, not that the slot
    // itself renders (that is the product checkout's own coverage).
    const bump = buildBumpView({
      name: "Vault",
      headline: "Add the Vault",
      description: null,
      bumpHeadline: null,
      bumpDescription: null,
      bumpBanner: "",
      bumpBullets: [],
      bumpNote: null,
      bumpAccent: "#b0532f",
      currency: "usd",
      compareAtCents: null,
      billingType: "one_time",
      interval: null,
      priceCents: 2900,
      trialDays: null,
    } as never);
    const onceAndMonthly: OfferPrice[] = [
      {
        id: "once",
        label: "",
        billingType: "one_time",
        interval: null,
        intervalCount: 1,
        trialDays: null,
        priceCents: 4700,
        compareAtCents: null,
        archived: false,
      },
      price({ id: "mo" }),
    ];
    const el = render(
      <OfferCheckoutForm
        offer={offer}
        signedInEmail="member@example.com"
        publishableKey="pk_test"
        prices={onceAndMonthly}
        chosen={0}
        bumpOptions={[bump]}
        skin="v2"
      />,
    );
    expect(el.textContent).toContain("Add the Vault");
    const box = el.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    act(() => box.click());
    // 4700 + 2900, undiscounted — the same arithmetic startOfferCheckout
    // authorises, read off the shared `dueNow` this layout did not have to
    // re-derive.
    expect(el.textContent).toMatch(/\$76/);

    // A recurring price opens a SetupIntent; a one-time bump has no charge to
    // ride. Switching to it must drop the bump, not just relabel the total.
    const radios = [...el.querySelectorAll<HTMLInputElement>('input[name="way-to-buy"]')];
    act(() => radios[1].click());
    expect(el.textContent).not.toContain("Add the Vault");
  });

  it("is the checkout that ships unless the redesign was asked for", () => {
    // The offer page takes real money today. Anything but an explicit v2 has to
    // render exactly what it rendered before this existed.
    const el = render(
      <OfferCheckoutForm offer={offer} signedInEmail="m@e.com" publishableKey="pk" prices={prices} chosen={1} />,
    );
    expect(el.textContent).toContain("Order summary");
    expect(el.textContent).toContain("Start my trial");
    expect(el.textContent).not.toContain("Choose your plan");
  });
});

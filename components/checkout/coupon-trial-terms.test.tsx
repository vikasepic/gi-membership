// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";

/**
 * The terms line says the trial that will actually happen.
 *
 * `priceTerms` is built from the price alone and cannot see a coupon, so a code
 * carrying `trial_days` left the checkout stating two different trials at once:
 * "7 days free, then $29 every month" from the price, and "30 days free instead
 * of 7" from the code, on screen together. Stripe was being told 30. The buyer
 * was left to guess which the card would honour.
 *
 * Asserted on BOTH skins because both are reachable — v2 is what everybody
 * gets, v1 is one query parameter away and is the fallback if a live sale goes
 * wrong on the new one.
 */

const preview = vi.hoisted(() => vi.fn());
vi.mock("@/app/(store)/checkout/offer/actions", () => ({
  startOffer: vi.fn(),
  previewOfferCouponAction: preview,
}));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve(null) }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => children,
  PaymentElement: () => null,
  useStripe: () => ({}),
  useElements: () => ({}),
}));

import { OfferCheckoutForm } from "@/components/checkout/offer-checkout-form";
import type { OfferPrice } from "@/lib/offer-prices";
import type { CheckoutSkin } from "@/lib/checkout-skin";

/** The live Content Engine shape: $29 a month, seven days free. */
const MONTHLY: OfferPrice = {
  id: "p-month",
  label: "",
  billingType: "recurring",
  interval: "month",
  intervalCount: 1,
  trialDays: 7,
  priceCents: 2900,
  compareAtCents: null,
  archived: false,
};

let root: { unmount: () => void } | null = null;
afterEach(() => {
  const r = root;
  root = null;
  if (r) act(() => r.unmount());
  preview.mockReset();
});

function mount(skin: CheckoutSkin) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      <OfferCheckoutForm
        offer={{
          id: "offer-1",
          headline: "Content Engine",
          description: null,
          chargeNowCents: 0,
          trialDays: 7,
          recurring: { priceCents: 2900, interval: "month" },
          acceptLabel: "Start",
          currency: "usd",
        }}
        signedInEmail="buyer@example.com"
        publishableKey="pk_test_x"
        prices={[MONTHLY]}
        chosen={0}
        skin={skin}
      />,
    );
  });
  return host;
}

const byText = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;

async function applyCode(host: HTMLElement, code: string) {
  await act(async () => byText(host, "Have a discount code?").click());
  const field = host.querySelector<HTMLInputElement>('input[aria-label="Discount code"]')!;
  // React tracks the last value it wrote, so a plain assignment is invisible to
  // it — go through the prototype setter the way React's own tests do.
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(field, code);
  await act(async () => {
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => byText(host, "Apply").click());
}

/** What CE1M26 resolves to against this price: 100% off, 30 days free. */
const CE1M26 = {
  ok: true,
  label: "CE1M26 — 100% off",
  discountCents: 2900,
  clamped: false,
  recurringDiscount: true,
  trialDays: 30,
};

describe.each(["v2", "v1"] as const)("a coupon that changes the trial (%s)", (skin) => {
  it("states the coupon's trial, and never the price's", async () => {
    preview.mockResolvedValue(CE1M26);
    const host = mount(skin);
    expect(host.textContent).toContain("7 days free");

    await applyCode(host, "CE1M26");

    expect(host.textContent).toContain("30 days free, then $29 every month");
    // The line the buyer would otherwise have read against a 30-day trial.
    expect(host.textContent).not.toContain("7 days free");
    // And nothing repeating it. Once the sentence is right, "30 days free
    // instead of 7" is the same fact told twice.
    expect(host.textContent).not.toContain("instead of 7");
  });

  it("says the trial is gone when the code takes it away", async () => {
    preview.mockResolvedValue({ ...CE1M26, label: "NOTRIAL — 10% off", trialDays: 0 });
    const host = mount(skin);

    await applyCode(host, "NOTRIAL");

    expect(host.textContent).not.toContain("days free");
    expect(host.textContent).toContain("then $29 every month");
  });

  it("leaves the price's own trial alone when the code says nothing about one", async () => {
    preview.mockResolvedValue({ ...CE1M26, label: "SAVE10 — 10% off", discountCents: 290, trialDays: null });
    const host = mount(skin);

    await applyCode(host, "SAVE10");

    expect(host.textContent).toContain("7 days free, then $29 every month");
  });
});

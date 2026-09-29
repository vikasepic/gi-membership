// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

/**
 * The form tells the server whether it promised a free trial.
 *
 * That flag is what turns "shown free, charged $29" into a refusal for a
 * returning trialist (startOfferCheckout, 29 Sep 2026). If the form ever
 * sent false while showing "7 days free", the server would charge them.
 */
const startOffer = vi.hoisted(() => vi.fn());
vi.mock("@/app/(store)/checkout/offer/actions", () => ({
  startOffer,
  previewOfferCouponAction: vi.fn(),
}));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve(null) }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => children,
  PaymentElement: () => null,
  useStripe: () => ({ confirmPayment: async () => ({}), confirmSetup: async () => ({}) }),
  useElements: () => ({ update: async () => {}, submit: async () => ({}) }),
}));

import { OfferCheckoutForm } from "@/components/checkout/offer-checkout-form";
import type { OfferPrice } from "@/lib/offer-prices";

const monthly = (trialDays: number | null): OfferPrice => ({
  id: "p-monthly",
  label: "",
  billingType: "recurring",
  interval: "month",
  intervalCount: 1,
  trialDays,
  installments: null,
  priceCents: 2900,
  compareAtCents: null,
  archived: false,
});

let root: Root | null = null;
afterEach(() => {
  const r = root;
  root = null;
  if (r) act(() => r.unmount());
  startOffer.mockReset();
});

async function submitWith(price: OfferPrice) {
  startOffer.mockResolvedValue({ ok: false, error: "stop here" });
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <OfferCheckoutForm
        offer={{
          id: "offer-1",
          key: "content-engine-instagram",
          headline: "Content Engine — Instagram",
          description: null,
          chargeNowCents: 0,
          trialDays: price.trialDays,
          recurring: { priceCents: 2900, interval: "month" },
          acceptLabel: "Start",
          currency: "usd",
        }}
        signedInEmail="buyer@example.com"
        publishableKey="pk_test_x"
        prices={[price]}
        chosen={0}
      />,
    );
  });
  await act(async () => {
    host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  return startOffer.mock.calls[0];
}

describe("what the offer form says it promised", () => {
  it("says a trial was shown when the price it shows carries one", async () => {
    expect((await submitWith(monthly(7))).at(-1)).toBe(true);
  });

  it("says none was shown for a price without one, which is what a returning trialist sees", async () => {
    expect((await submitWith(monthly(null))).at(-1)).toBe(false);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";

const preview = vi.hoisted(() => vi.fn());
vi.mock("@/app/(store)/checkout/offer/actions", () => ({
  startOffer: vi.fn(),
  previewOfferCouponAction: preview,
}));
// Stripe's Elements would fetch js.stripe.com and mount an iframe; neither has
// anything to do with which price is selected.
vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve(null) }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => children,
  PaymentElement: () => null,
  useStripe: () => ({}),
  // The form's own effect calls elements.update on every render that changes
  // the price or coupon — a bare {} throws the moment it mounts.
  useElements: () => ({ update: async () => {} }),
}));

import { OfferCheckoutForm } from "@/components/checkout/offer-checkout-form";
import type { OfferPrice } from "@/lib/offer-prices";

const price = (id: string, interval: "month" | "year", cents: number, trialDays: number | null): OfferPrice => ({
  id,
  label: "",
  billingType: "recurring",
  interval,
  intervalCount: 1,
  trialDays,
  priceCents: cents,
  compareAtCents: null,
  archived: false,
});

const PRICES = [price("p-month", "month", 2900, 7), price("p-year", "year", 19900, null)];

let root: { unmount: () => void } | null = null;
afterEach(() => {
  const r = root;
  root = null;
  if (r) act(() => r.unmount());
  preview.mockReset();
});

function mount() {
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
        prices={PRICES}
        chosen={0}
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
  // React tracks the last value it wrote, so a plain assignment is invisible
  // to it — go through the prototype setter the way React's own tests do.
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(field, code);
  await act(async () => {
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => byText(host, "Apply").click());
}

const radios = (host: HTMLElement) => [...host.querySelectorAll<HTMLInputElement>('input[name="offer-price"]')];

/**
 * A code scoped to one billing period, and a buyer who then switches.
 *
 * The spec: "a monthly-only code applied and then followed by a switch to
 * yearly is dropped, with a message saying why. It must not silently persist
 * and it must not silently apply."
 *
 * Nothing re-ran the preview when the radio changed, so the label, the discount
 * and the code's trial stayed on screen against the yearly price.
 * startOfferCheckout re-resolves and refuses at the end — so the buyer read
 * "30 days free" beside $199/year, pressed pay, and was then told no.
 */
describe("switching how you pay, with a code already applied", () => {
  it("re-prices the code against the newly chosen price", async () => {
    preview.mockResolvedValue({
      ok: true,
      label: "SAVE — 20% off",
      discountCents: 580,
      clamped: false,
      recurringDiscount: false,
      trialDays: 30,
    });
    const host = mount();
    await applyCode(host, "SAVE");
    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenLastCalledWith("offer-1", "SAVE", 0);

    await act(async () => radios(host)[1].click());
    expect(preview).toHaveBeenCalledTimes(2);
    expect(preview).toHaveBeenLastCalledWith("offer-1", "SAVE", 1);
  });

  it("drops a code the new price cannot use, and says why", async () => {
    preview.mockResolvedValueOnce({
      ok: true,
      label: "MONTHLYONLY — 20% off",
      discountCents: 580,
      clamped: false,
      recurringDiscount: false,
      trialDays: 30,
    });
    const host = mount();
    await applyCode(host, "MONTHLYONLY");
    expect(host.textContent).toContain("MONTHLYONLY — 20% off");
    // The code's trial, stated by the terms line itself — which is where a
    // coupon's trial is said now, rather than in a note beside it.
    expect(host.textContent).toContain("30 days free, then $29 every month");

    preview.mockResolvedValueOnce({ ok: false, error: "That code can’t be used on this purchase." });
    await act(async () => radios(host)[1].click());

    expect(host.textContent).not.toContain("MONTHLYONLY — 20% off");
    expect(host.textContent).not.toContain("30 days free");
    expect(host.textContent).toContain("That code can’t be used on this purchase.");
  });

  it("does not ask the server about a code nobody applied", async () => {
    const host = mount();
    await act(async () => radios(host)[1].click());
    expect(preview).not.toHaveBeenCalled();
  });
});

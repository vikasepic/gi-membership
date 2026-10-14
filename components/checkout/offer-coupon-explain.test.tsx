// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { OfferPrice } from "@/lib/offer-prices";

/**
 * Arriving from a sales page's buy button, then applying a code (14 Oct 2026).
 *
 * The owner applied SMS (30 days free instead of 7, and 100% off) after
 * clicking Buy on the Content Engine page. The pill above the name changed to
 * 30 days; the summary still said "$0" with no terms, and the code's own line
 * said only "100% off applied", so it read as if nothing had happened. The buy
 * button names no price, so nothing was chosen, and the summary only states
 * terms for a chosen price, although the server charges the headline one.
 */

vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve(null) }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PaymentElement: () => null,
  useStripe: () => ({}),
  useElements: () => ({ submit: async () => ({}), update: async () => {} }),
}));
const preview = vi.hoisted(() => vi.fn());
vi.mock("@/app/(store)/checkout/offer/actions", () => ({
  startOffer: async () => ({ ok: false, error: "not in a test" }),
  previewOfferCouponAction: preview,
}));

const { OfferCheckoutForm } = await import("@/components/checkout/offer-checkout-form");

const price = (over: Partial<OfferPrice>): OfferPrice => ({
  id: "p",
  label: "",
  billingType: "recurring",
  interval: "month",
  intervalCount: 1,
  trialDays: 7,
  installments: null,
  priceCents: 2900,
  compareAtCents: null,
  archived: false,
  ...over,
});

const offer = {
  id: "o1",
  key: "content-engine-linkedin",
  headline: "Content Engine — LinkedIn",
  description: null,
  chargeNowCents: 0,
  trialDays: 7,
  installments: null,
  recurring: { priceCents: 2900, interval: "month" },
  acceptLabel: "Start my trial",
  currency: "usd",
};

let host: HTMLDivElement | null = null;
function render(prices: OfferPrice[]): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host!).render(
      <OfferCheckoutForm offer={offer} signedInEmail="m@example.com" publishableKey="pk" prices={prices} chosen={-1} skin="v2" />,
    );
  });
  return host;
}
afterEach(() => {
  host?.remove();
  host = null;
  preview.mockReset();
});

const ways = (el: HTMLElement) => [...el.querySelectorAll<HTMLInputElement>('input[name="way-to-buy"]')];

async function applyCode(el: HTMLElement, code: string) {
  const open = [...el.querySelectorAll("button")].find((b) => /discount code/i.test(b.textContent ?? ""));
  if (open) await act(async () => open.click());
  const field = el.querySelector<HTMLInputElement>('input[aria-label="Discount code"]')!;
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(field, code);
  await act(async () => {
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const apply = [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Apply")!;
  await act(async () => apply.click());
}

const monthly = price({ id: "mo" });
const yearly = price({ id: "yr", interval: "year", priceCents: 19900, trialDays: null });

describe("arriving from a buy button with no price named", () => {
  it("chooses the headline price when every way to pay is a subscription", () => {
    const el = render([monthly, yearly]);
    expect(ways(el).map((w) => w.checked)).toEqual([true, false]);
    expect(el.textContent).toContain("7 days free, then $29 every month");
  });

  it("still chooses nothing when one way is a one-off and another a subscription", () => {
    // The rule this checkout keeps: never put somebody on a subscription
    // when they might have meant to pay once.
    const el = render([price({ id: "once", billingType: "one_time", interval: null, trialDays: null, priceCents: 9900 }), monthly]);
    expect(ways(el).some((w) => w.checked)).toBe(false);
  });
});

describe("a code that changes the trial", () => {
  it("says at the code what it did to the trial and to the price", async () => {
    preview.mockResolvedValue({
      ok: true,
      label: "SMS — 100% off",
      discountCents: 2900,
      clamped: false,
      recurringDiscount: false,
      trialDays: 30,
      installments: null,
    });
    const el = render([monthly, yearly]);
    await applyCode(el, "SMS");
    const text = el.textContent ?? "";
    expect(text).toContain("SMS — 100% off applied");
    expect(text).toContain("30-day free trial instead of 7 days");
    expect(text).toContain("$29 off your first payment after the trial. Renewals are at the full price.");
    expect(text).toContain("30 days free, then $29 every month");
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";

// Three things review named as the ways this feature fails expensively rather
// than loudly: a displayed total that disagrees with what the server actually
// authorises, a wallet quoting the pre-bump figure because Elements never
// heard about the tick, and a tickbox offered against a recurring price that
// startOfferCheckout can only refuse. Source-text tests (offer-bump-render,
// offer-elements-mode) pin the SHAPE of the fix; this file mounts the real
// component to prove the NUMBERS it produces are the ones the story requires.

const startOffer = vi.hoisted(() => vi.fn());
const elementsUpdate = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/app/(store)/checkout/offer/actions", () => ({
  startOffer,
  previewOfferCouponAction: vi.fn(),
}));
// Stripe's Elements would fetch js.stripe.com and mount an iframe; neither has
// anything to do with what the bump does to a total.
vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve(null) }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => children,
  PaymentElement: () => null,
  useStripe: () => ({
    confirmPayment: async () => ({}),
    confirmSetup: async () => ({}),
  }),
  useElements: () => ({ update: elementsUpdate, submit: async () => ({}) }),
}));

import { OfferCheckoutForm } from "@/components/checkout/offer-checkout-form";
import { buildBumpView } from "@/lib/bump";
import type { OfferPrice } from "@/lib/offer-prices";

const oneTime: OfferPrice = {
  id: "p-onetime",
  label: "",
  billingType: "one_time",
  interval: null,
  intervalCount: 1,
  trialDays: null,
  priceCents: 4700,
  compareAtCents: null,
  archived: false,
};
const recurring: OfferPrice = {
  id: "p-monthly",
  label: "",
  billingType: "recurring",
  interval: "month",
  intervalCount: 1,
  trialDays: null,
  priceCents: 2900,
  compareAtCents: null,
  archived: false,
};

// buildBumpView wants an OfferLike; only the fields it actually reads matter
// here — same shorthand components/checkout/bump-options.test.tsx already
// uses for the same reason.
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

let root: { unmount: () => void } | null = null;
afterEach(() => {
  const r = root;
  root = null;
  if (r) act(() => r.unmount());
  startOffer.mockReset();
  elementsUpdate.mockClear();
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
          chargeNowCents: 4700,
          trialDays: null,
          recurring: null,
          acceptLabel: "Start",
          currency: "usd",
        }}
        signedInEmail="buyer@example.com"
        publishableKey="pk_test_x"
        prices={[oneTime, recurring]}
        chosen={0}
        bumpOptions={[bump]}
      />,
    );
  });
  return host;
}

const radios = (host: HTMLElement) => [...host.querySelectorAll<HTMLInputElement>('input[name="offer-price"]')];
const bumpBox = (host: HTMLElement) => host.querySelector<HTMLInputElement>('input[type="checkbox"]');
const totalText = (host: HTMLElement) => host.querySelector(".font-display.text-2xl")?.textContent ?? "";

describe("the bump's effect on an offer checkout's total", () => {
  it("adds to the total undiscounted, on top of the host's own price", async () => {
    const host = mount();
    expect(totalText(host)).toBe("$47"); // host alone, nothing ticked yet
    await act(async () => bumpBox(host)!.click());
    // 4700 + 2900 — the same arithmetic startOfferCheckout authorises
    // (gross - discount + bumpNowCents), not a coupon-style application to
    // the combined figure.
    expect(totalText(host)).toBe("$76");
  });

  it("moves Elements' amount the instant the tick does", async () => {
    const host = mount();
    elementsUpdate.mockClear(); // drop the mount-time call, before any tick
    await act(async () => bumpBox(host)!.click());
    expect(elementsUpdate).toHaveBeenCalledWith(expect.objectContaining({ mode: "payment", amount: 7600 }));
  });

  it("posts the ticked index to the server as bumpChoice, the final argument", async () => {
    startOffer.mockResolvedValue({ ok: true, clientSecret: "seti_x", mode: "payment" });
    const host = mount();
    await act(async () => bumpBox(host)!.click());
    const form = host.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(startOffer).toHaveBeenCalledWith("offer-1", 0, null, undefined, 0);
  });

  it("hides the bump, and clears the tick, once the chosen price is recurring", async () => {
    const host = mount();
    await act(async () => bumpBox(host)!.click());
    expect(bumpBox(host)?.checked).toBe(true);

    // The server refuses a bump against a recurring host outright — a
    // SetupIntent moves no money today for a one-time bump to ride.
    await act(async () => radios(host)[1].click());
    expect(bumpBox(host)).toBeNull();
    expect(totalText(host)).not.toContain("76");

    // Back to one-time: the earlier tick must not resurface un-reconfirmed.
    await act(async () => radios(host)[0].click());
    expect(bumpBox(host)?.checked).toBe(false);
    expect(totalText(host)).toBe("$47");
  });
});

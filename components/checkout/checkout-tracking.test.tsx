// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { OfferPrice } from "@/lib/offer-prices";

/**
 * What the offer checkout, the price panels and the sales pages tell Meta and GA4.
 *
 * Found 26 Sep 2026: the offer checkout sent nothing between the buy click and
 * the purchase, and a buy button inside a Ways to pay block sent no AddToCart.
 * Every offer funnel therefore read AddToCart, then silence, then a few
 * purchases. These tests watch the one door every event goes through.
 */

const track = vi.fn();
vi.mock("@/components/analytics", async (orig) => ({
  ...(await orig<typeof import("@/components/analytics")>()),
  track: (...args: unknown[]) => track(...args),
}));
// Captures the PaymentElement's onChange so a test can "type" into it.
let cardChange: ((e: { empty: boolean }) => void) | undefined;
vi.mock("@stripe/stripe-js", () => ({ loadStripe: () => Promise.resolve(null) }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PaymentElement: (p: { onChange?: (e: { empty: boolean }) => void }) => {
    cardChange = p.onChange;
    return <div data-testid="payment-element" />;
  },
  useStripe: () => ({}),
  useElements: () => ({ submit: async () => ({}), update: async () => {} }),
}));
vi.mock("@/app/(store)/checkout/offer/actions", () => ({
  startOffer: async () => ({ ok: false, error: "not in a test" }),
  previewOfferCouponAction: async () => ({ ok: false, error: "no" }),
}));
vi.mock("@/app/(store)/checkout/oto/actions", () => ({ acceptOtoAction: async () => {} }));

const { OfferCheckoutForm } = await import("@/components/checkout/offer-checkout-form");
const { PriceChoice } = await import("@/components/page/price-choice");
const { ScrollTracker, SCROLL_MILESTONES } = await import("@/components/scroll-tracker");
const { META_CUSTOM, NO_VALUE, GA4_NAME } = await import("@/lib/analytics/events");

const oneTime: OfferPrice = {
  id: "once",
  label: "",
  billingType: "one_time",
  interval: null,
  intervalCount: 1,
  trialDays: null,
  installments: null,
  priceCents: 2900,
  compareAtCents: null,
  archived: false,
} as OfferPrice;

const offer = {
  id: "o1",
  key: "the-micro-product-builder",
  headline: "The Micro-Product Builder",
  description: null,
  chargeNowCents: 2900,
  trialDays: null,
  recurring: null,
  acceptLabel: "Pay",
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
const named = (name: string) => track.mock.calls.filter((c) => c[0] === name);

beforeEach(() => track.mockClear());
afterEach(() => {
  host?.remove();
  host = null;
});

describe("the offer checkout reports its funnel", () => {
  const form = () =>
    render(
      <OfferCheckoutForm offer={offer} signedInEmail={null} publishableKey="pk_test" prices={[oneTime]} chosen={0} skin="v2" />,
    );

  it("says a checkout started, once, with the offer's key and what is due today", () => {
    form();
    const calls = named("InitiateCheckout");
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({ value: 29, currency: "USD", content_ids: ["the-micro-product-builder"] });
    expect(String(calls[0][2])).toMatch(/^InitiateCheckout\./);
  });

  it("reports an address once, however many times the field is left", () => {
    const el = form();
    const input = el.querySelector('input[type="email"]') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setValue.call(input, "Buyer@Example.com");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    const calls = named("CheckoutEmailEntered");
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({ content_ids: ["the-micro-product-builder"] });
  });

  it("reports payment info on the first touch of the card fields, and only then", () => {
    form();
    expect(named("AddPaymentInfo")).toHaveLength(0);
    act(() => cardChange?.({ empty: true }));
    expect(named("AddPaymentInfo")).toHaveLength(0);
    act(() => cardChange?.({ empty: false }));
    act(() => cardChange?.({ empty: false }));
    expect(named("AddPaymentInfo")).toHaveLength(1);
    expect(named("AddPaymentInfo")[0][1]).toMatchObject({ value: 29, content_ids: ["the-micro-product-builder"] });
  });
});

describe("a buy button in a Ways to pay block", () => {
  it("reports AddToCart with its price, its words and its section", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    host.innerHTML = `<section><h2>Pick your plan</h2><div id="slot"></div></section>`;
    act(() => {
      createRoot(host!.querySelector("#slot")!).render(
        <PriceChoice
          prices={[oneTime]}
          currency="usd"
          heading=""
          note=""
          acceptLabel="Get instant access"
          href="/checkout/offer?offer=o1"
          chosen={0}
          band={{ bg: "#fff", fg: "#000", muted: "#666", accent: "#c00" } as never}
          s={{} as never}
        />,
      );
    });
    const link = Array.from(host.querySelectorAll("a")).find((a) => a.textContent === "Get instant access")!;
    expect(link).toBeTruthy();
    link.addEventListener("click", (e) => e.preventDefault());
    act(() => link.click());
    const calls = named("AddToCart");
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toMatchObject({
      value: 29,
      currency: "USD",
      button_text: "Get instant access",
      section_name: "Pick your plan",
    });
  });
});

describe("scroll milestones reach Meta and GA4", () => {
  it("fires each of 25/50/75/100 once, in order, with the section reached", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    host.innerHTML = `<section><h2>Hero</h2></section><section><h2>Offer</h2></section><div id="t"></div>`;
    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 4000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
    const sections = host.querySelectorAll("section");
    sections[0].getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    sections[1].getBoundingClientRect = () => ({ top: 5000 }) as DOMRect;
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    act(() => {
      createRoot(host!.querySelector("#t")!).render(<ScrollTracker path="/o/x" />);
    });
    // At rest: a quarter of the page is on screen.
    expect(named("ScrollDepth").map((c) => (c[1] as { percent_scrolled: number }).percent_scrolled)).toEqual([25]);

    sections[1].getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    Object.defineProperty(window, "scrollY", { configurable: true, value: 3000 });
    act(() => window.dispatchEvent(new Event("scroll")));
    act(() => window.dispatchEvent(new Event("scroll")));

    const fired = named("ScrollDepth").map((c) => c[1] as Record<string, unknown>);
    expect(fired.map((p) => p.percent_scrolled)).toEqual([...SCROLL_MILESTONES]);
    expect(fired.at(-1)).toMatchObject({ page_path: "/o/x", page_section: 2, section_name: "Offer" });
    raf.mockRestore();
  });

  it("is custom on Meta, carries no value, and has its own GA4 name", () => {
    for (const e of ["ScrollDepth", "UpsellViewed"] as const) {
      expect(META_CUSTOM).toContain(e);
      expect(NO_VALUE).toContain(e);
    }
    expect(GA4_NAME.ScrollDepth).toBe("scroll_depth");
    expect(GA4_NAME.UpsellViewed).toBe("view_promotion");
  });
});

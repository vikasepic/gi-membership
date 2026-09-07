// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import type { OfferPrice } from "@/lib/offer-prices";

/**
 * The PRODUCT checkout says the trial the code actually gives, against the
 * price they actually picked.
 *
 * `finalizeOrder` already honours `coupon.trialDays` when it makes the
 * subscription, so Stripe was being told thirty days while every sentence on
 * this form went on stating the price's seven — the terms under the picked
 * plan, the summary line, and the renewal line under the total. The offer
 * checkout was fixed in b588b3a; this half was left promising the other trial.
 *
 * And a code can be scoped to one billing period, so switching the plan after
 * applying one has to re-ask the server: startCheckout re-resolves and refuses
 * at the end, which means a code left on screen is a promise the pay button
 * breaks.
 */

const preview = vi.hoisted(() => vi.fn());
vi.mock("@/app/(store)/checkout/actions", () => ({
  startCheckout: async () => ({ ok: false, error: "not under test" }),
  previewCoupon: preview,
  captureAbandonedCart: async () => {},
}));
vi.mock("@/components/analytics", () => ({ track: () => {} }));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: async () => null }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => children,
  PaymentElement: () => null,
  useStripe: () => ({}),
  useElements: () => null,
}));

const { CheckoutForm } = await import("@/components/checkout/checkout-form");

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

/** Two ways to buy: the live Content Engine shape, plus a yearly beside it. */
const MONTHLY = price({ id: "p-month" });
const YEARLY = price({ id: "p-year", interval: "year", priceCents: 19900, trialDays: 0 });

/** What a code carrying `trial_days=30` resolves to against the monthly. */
const CE1M26 = {
  ok: true,
  label: "CE1M26 — 100% off",
  discountCents: 2900,
  clamped: false,
  trialDays: 30,
};

let root: { unmount: () => void } | null = null;
beforeEach(() => preview.mockReset());
afterEach(() => {
  const r = root;
  root = null;
  if (r) act(() => r.unmount());
});

function mount(prices: OfferPrice[]) {
  const host = document.createElement("div");
  document.body.innerHTML = "";
  document.body.append(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      <CheckoutForm
        product={{
          slug: "field-guide",
          title: "The Field Guide",
          tagline: null,
          priceCents: 2900,
          currency: "usd",
          prices,
        }}
        bump={null}
        publishableKey="pk_test_x"
        signedInEmail="buyer@example.com"
      />,
    );
  });
  return host;
}

const byText = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
const radios = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLInputElement>('input[type="radio"][name="way-to-buy"]')];

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

describe("a code that changes the trial, on the product checkout", () => {
  it("states the coupon's trial and never the price's", async () => {
    preview.mockResolvedValue(CE1M26);
    const host = mount([MONTHLY]);
    expect(host.textContent).toContain("7 days free");

    await applyCode(host, "CE1M26");

    expect(host.textContent).toContain("30 days free, then $29 every month");
    // The sentence the buyer would otherwise have read against a card Stripe
    // has been told to give thirty days.
    expect(host.textContent).not.toContain("7 days free");
  });

  it("says the trial is gone when the code takes it away", async () => {
    // Zero is a real answer and `||` would read it as "says nothing".
    preview.mockResolvedValue({ ...CE1M26, label: "NOTRIAL — 10% off", trialDays: 0 });
    const host = mount([MONTHLY]);

    await applyCode(host, "NOTRIAL");

    expect(host.textContent).not.toContain("days free");
    expect(host.textContent).toContain("then $29 every month");
  });

  it("leaves the price's own trial alone when the code says nothing about one", async () => {
    preview.mockResolvedValue({ ...CE1M26, label: "SAVE10 — 10% off", discountCents: 290, trialDays: null });
    const host = mount([MONTHLY]);

    await applyCode(host, "SAVE10");

    expect(host.textContent).toContain("7 days free, then $29 every month");
  });
});

describe("switching how you pay, with a code already applied", () => {
  it("prices the code against the way to pay that is ticked", async () => {
    preview.mockResolvedValue(CE1M26);
    const host = mount([MONTHLY, YEARLY]);
    await act(async () => radios(host)[1].click());
    await applyCode(host, "CE1M26");

    // The index the form posts when it charges, so the preview and the charge
    // cannot be scoped to two different prices.
    expect(preview.mock.calls.at(-1)).toEqual(["field-guide", "CE1M26", 1]);
  });

  it("re-prices the code against the newly chosen price", async () => {
    preview.mockResolvedValue(CE1M26);
    const host = mount([MONTHLY, YEARLY]);
    await act(async () => radios(host)[0].click());
    await applyCode(host, "CE1M26");
    expect(preview).toHaveBeenCalledTimes(1);

    await act(async () => radios(host)[1].click());

    expect(preview).toHaveBeenCalledTimes(2);
    expect(preview.mock.calls.at(-1)).toEqual(["field-guide", "CE1M26", 1]);
  });

  it("drops a code the new price does not take, with the reason", async () => {
    preview.mockResolvedValue(CE1M26);
    const host = mount([MONTHLY, YEARLY]);
    await act(async () => radios(host)[0].click());
    await applyCode(host, "MONTHLYONLY");
    expect(host.textContent).toContain("30 days free, then $29 every month");

    preview.mockResolvedValue({ ok: false, error: "That code can’t be used on this purchase." });
    await act(async () => radios(host)[1].click());

    expect(host.textContent).not.toContain("CE1M26 — 100% off");
    expect(host.textContent).not.toContain("30 days free");
    expect(host.textContent).toContain("That code can’t be used on this purchase.");
  });

  it("asks nothing when no code has been applied", async () => {
    const host = mount([MONTHLY, YEARLY]);
    await act(async () => radios(host)[1].click());
    expect(preview).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";

/**
 * The selling half states the same trial as the paying half.
 *
 * `priceTerms` learned to see a coupon, so the FORM says the trial a code
 * actually grants. The stage did not: it is server-rendered from
 * `offer.trialDays` while the coupon is client state, so a buyer applying
 * CE1M26 — 30 days against a 7-day price — read "30 days free" on the right
 * and "Content Engine · 7-day free trial" on the left at the same time.
 *
 * What is asserted here is the whole screen at once: the stage's pill, the
 * stage's caption and the form's terms line, in one tree, after the same
 * click. Any one of them going its own way is the bug.
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
  // The form's own effect calls elements.update on every render that changes
  // the price or coupon — a bare {} throws the moment it mounts.
  useElements: () => ({ update: async () => {} }),
}));

import { OfferCheckoutForm } from "@/components/checkout/offer-checkout-form";
import { CheckoutStage } from "@/components/checkout/v2/stage";
import { CheckoutTrial, TrialEyebrow, TrialPriceTerms } from "@/components/checkout/trial";
import { CHECKOUT_DESIGN_DEFAULTS } from "@/lib/checkout-design";
import type { OfferPrice } from "@/lib/offer-prices";

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

const YEARLY: OfferPrice = { ...MONTHLY, id: "p-year", interval: "year", priceCents: 19900 };

// The back link is Next's, and it wants a router this test has no reason to
// mount. Everything asserted here is text.
const DESIGN = { ...CHECKOUT_DESIGN_DEFAULTS, showBackLink: false };

let root: { unmount: () => void } | null = null;
afterEach(() => {
  const r = root;
  root = null;
  if (r) act(() => r.unmount());
  preview.mockReset();
});

/**
 * Both halves of the checkout, wired the way the page wires them: one provider
 * seeded with the offer's own trial, the stage inside it, the form beside it.
 */
function mount({ prices = [MONTHLY], chosen = 0 }: { prices?: OfferPrice[]; chosen?: number } = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host);
  root = r;
  act(() => {
    r.render(
      <CheckoutTrial days={7}>
        <CheckoutStage
          design={DESIGN}
          backHref="/library"
          backLabel="Back"
          eyebrow={<TrialEyebrow name="Content Engine" />}
          title="Content Engine"
          sub={null}
          imageUrl={null}
          bullets={[]}
          priceLabel={prices.length === 1 ? "$29" : null}
          priceCaption={
            prices.length === 1 && prices[0].billingType === "recurring" ? (
              <TrialPriceTerms price={prices[0]} currency="usd" />
            ) : null
          }
        />
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
          prices={prices}
          chosen={chosen}
          skin="v1"
        />
      </CheckoutTrial>,
    );
  });
  return host;
}

const byText = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;

async function applyCode(host: HTMLElement, code: string) {
  const opener = byText(host, "Have a discount code?");
  if (opener) await act(async () => opener.click());
  const field = host.querySelector<HTMLInputElement>('input[aria-label="Discount code"]')!;
  // React tracks the last value it wrote, so a plain assignment is invisible to
  // it — go through the prototype setter the way React's own tests do.
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(field, code);
  await act(async () => {
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // "Apply" the first time, "Change" once one is already on.
  const submit = byText(host, "Apply") ?? byText(host, "Change");
  await act(async () => submit.click());
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

const stage = (host: HTMLElement) => host.querySelector(".checkout-v2-stage")!.textContent ?? "";

describe("the stage and the form on one screen", () => {
  it("moves the stage to the trial the code actually grants", async () => {
    preview.mockResolvedValue(CE1M26);
    const host = mount();
    expect(stage(host)).toContain("Content Engine · 7-day free trial");
    expect(stage(host)).toContain("7 days free, then $29 every month");

    await applyCode(host, "CE1M26");

    expect(stage(host)).toContain("Content Engine · 30-day free trial");
    expect(stage(host)).toContain("30 days free, then $29 every month");
    // The number the buyer would otherwise have read against a 30-day trial.
    expect(stage(host)).not.toContain("7-day free trial");
    expect(stage(host)).not.toContain("7 days free");
  });

  it("puts the stage back when the code goes away", async () => {
    preview.mockResolvedValue(CE1M26);
    const host = mount();
    await applyCode(host, "CE1M26");
    expect(stage(host)).toContain("30-day free trial");

    // A code that no longer resolves clears the applied one — the same path a
    // buyer takes by replacing the code in the box with a dead one.
    preview.mockResolvedValue({ ok: false, error: "That code isn’t valid." });
    await applyCode(host, "NOPE");

    expect(stage(host)).toContain("Content Engine · 7-day free trial");
    expect(stage(host)).toContain("7 days free, then $29 every month");
    expect(stage(host)).not.toContain("30-day");
    expect(stage(host)).not.toContain("30 days");
  });

  it("stops the stage claiming a trial when the code takes it away", async () => {
    preview.mockResolvedValue({ ...CE1M26, label: "NOTRIAL — 10% off", trialDays: 0 });
    const host = mount();

    await applyCode(host, "NOTRIAL");

    // Not a shorter trial — none. The pill states the offer's name alone.
    expect(stage(host)).not.toContain("free trial");
    expect(stage(host)).not.toContain("days free");
    expect(stage(host)).toContain("then $29 every month");
  });

  it("leaves the stage alone when the code says nothing about a trial", async () => {
    preview.mockResolvedValue({ ...CE1M26, label: "SAVE10 — 10% off", discountCents: 290, trialDays: null });
    const host = mount();

    await applyCode(host, "SAVE10");

    expect(stage(host)).toContain("Content Engine · 7-day free trial");
    expect(stage(host)).toContain("7 days free, then $29 every month");
  });
});

describe("the renewal note, with no price picked yet", () => {
  it("states the code's trial rather than the offer's", async () => {
    preview.mockResolvedValue(CE1M26);
    // Two ways to pay and neither chosen — the one case where the form falls
    // back to the offer's own sentence instead of the picked price's terms.
    const host = mount({ prices: [MONTHLY, YEARLY], chosen: -1 });
    expect(host.textContent).toContain("Then $29/month after your 7-day trial. Cancel anytime.");

    await applyCode(host, "CE1M26");

    expect(host.textContent).toContain("Then $29/month after your 30-day trial. Cancel anytime.");
    expect(host.textContent).not.toContain("7-day trial");
  });
});

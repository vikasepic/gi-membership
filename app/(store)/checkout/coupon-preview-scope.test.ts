import { describe, it, expect, vi, beforeEach } from "vitest";
import type { OfferPrice } from "@/lib/offer-prices";

/**
 * The product checkout's coupon preview is scoped to the price they picked.
 *
 * It had no price choice to read, so it scoped every code to the product's
 * headline billing — and a multi-price product could therefore preview an
 * interval-scoped code as valid against the yearly and have the charge, which
 * DOES know the choice, refuse it. The buyer read a discount, pressed pay and
 * was only then told no.
 *
 * The trial matters for the same reason: a code carrying `trial_days` is what
 * `finalizeOrder` hands Stripe, so a preview that does not return it leaves the
 * page promising the price's trial against a card getting the coupon's.
 */

const resolve = vi.hoisted(() => vi.fn());
const product = vi.hoisted(() => vi.fn());

vi.mock("@/lib/coupons", async (orig) => ({
  ...(await orig<typeof import("@/lib/coupons")>()),
  resolveCoupon: (...a: unknown[]) => resolve(...a),
}));
vi.mock("@/lib/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/store")>()),
  getProductBySlug: (...a: unknown[]) => product(...a),
}));

const { previewCoupon } = await import("@/app/(store)/checkout/actions");

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

const MONTHLY = price({ id: "p-month" });
const YEARLY = price({ id: "p-year", interval: "year", priceCents: 19900, trialDays: 0 });

beforeEach(() => {
  resolve.mockReset();
  product.mockReset();
  product.mockResolvedValue({
    slug: "field-guide",
    status: "published",
    priceCents: 2900,
    currency: "usd",
    prices: [MONTHLY, YEARLY],
  });
  resolve.mockResolvedValue({
    ok: true,
    coupon: {
      label: "CE1M26 — 100% off",
      discountCents: 2900,
      clamped: false,
      recurringDiscount: true,
      trialDays: 30,
      code: "CE1M26",
      promotionCodeId: "promo_1",
    },
  });
});

/** The interval `resolveCoupon` was scoped to on the last call. */
const scopedTo = () => (resolve.mock.calls.at(-1)?.[3] as { interval: string | null }).interval;

describe("which price the product's coupon preview is scoped to", () => {
  it("scopes to the price they picked, not the headline", async () => {
    await previewCoupon("field-guide", "CE1M26", 1);
    expect(scopedTo()).toBe("year");
  });

  it("still scopes to the headline when no choice is passed", async () => {
    await previewCoupon("field-guide", "CE1M26");
    expect(scopedTo()).toBe("month");
  });

  it("refuses a choice that is not on the list, exactly as the charge does", async () => {
    // Falling back to the headline here would preview a code against something
    // the buyer was never shown, and createCheckoutIntent refuses the same
    // index outright.
    expect(await previewCoupon("field-guide", "CE1M26", 9)).toEqual({
      ok: false,
      error: "That option is no longer available.",
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("returns the trial the code grants", async () => {
    // Zero is a real answer — a code can take the trial away — and null means
    // it says nothing about one, so the page keeps the price's.
    expect(await previewCoupon("field-guide", "CE1M26", 0)).toMatchObject({ ok: true, trialDays: 30 });
  });
});

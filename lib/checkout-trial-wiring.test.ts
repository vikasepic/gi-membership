import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The coupon's trial beats the price's, at both places a subscription is made.
 *
 * A source-reading test because the alternative is driving two Stripe
 * subscription creations against a live API, and the failure this catches is
 * one of the two sites being missed — which would look like the promotion
 * working, until somebody bought the other kind of thing.
 */
describe("a coupon's trial reaches Stripe", () => {
  const src = readFileSync("lib/checkout.ts", "utf8");

  it("prefers the coupon's trial at both subscription sites", () => {
    const uses = src.match(/trial_period_days:\s*[^\n]*/g) ?? [];
    expect(uses).toHaveLength(2);
    for (const line of uses) {
      expect(line).toMatch(/coupon/);
      expect(line).toMatch(/\?\?/);
    }
  });

  it("still hands Stripe the promotion code rather than computing a discount", () => {
    // The duration is Stripe's to apply. Computing it here is how the invoice
    // and the receipt start disagreeing.
    expect(src.match(/promotion_code:/g) ?? []).toHaveLength(2);
  });
});

describe("every coupon lookup says what interval is being bought", () => {
  for (const file of [
    "lib/offer-checkout.ts",
    "lib/checkout.ts",
    "app/(store)/checkout/actions.ts",
  ]) {
    it(`${file} passes an interval with every item`, () => {
      const s = readFileSync(file, "utf8");
      const items = s.match(/item:\s*[^,\n]+/g) ?? [];
      const intervals = s.match(/interval:\s*[^,\n]+/g) ?? [];
      expect(items.length).toBeGreaterThan(0);
      expect(intervals.length).toBeGreaterThanOrEqual(items.length);
    });
  }
});

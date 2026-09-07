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

/**
 * Extracts the argument text of every `name(...)` call in `src`, matching
 * parens by depth rather than by regex, since a call's own arguments (e.g.
 * `chosen?.interval ?? null`) contain nested parens that a line-based match
 * can't skip over.
 */
function callArgSpans(src: string, name: string): string[] {
  const marker = `${name}(`;
  const spans: string[] = [];
  let idx = src.indexOf(marker);
  while (idx !== -1) {
    let depth = 1;
    let i = idx + marker.length;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    spans.push(src.slice(idx + marker.length, i - 1));
    idx = src.indexOf(marker, i);
  }
  return spans;
}

describe("every coupon lookup says what interval is being bought", () => {
  for (const file of [
    "lib/offer-checkout.ts",
    "lib/checkout.ts",
    "app/(store)/checkout/actions.ts",
  ]) {
    it(`${file} passes an interval with every item`, () => {
      const s = readFileSync(file, "utf8");
      // Scoped per resolveCoupon() call, not counted across the whole file —
      // lib/checkout.ts also has two unrelated `interval:` fields inside its
      // Stripe subscription bodies, which would silently satisfy a raw count.
      const calls = callArgSpans(s, "resolveCoupon");
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call).toMatch(/item:/);
        expect(call).toMatch(/interval:/);
      }
    });
  }
});

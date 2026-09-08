import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("components/checkout/offer-checkout-form.tsx", "utf8");

describe("the offer form keeps Elements' mode in step with what it charges", () => {
  it("switches Elements to payment mode, with the same amount the page shows as due", () => {
    // Tied to elements.update specifically, not just the string "payment" —
    // onSubmit's `res.mode === "payment"` already contains that word, and
    // would make a looser match pass even with Elements frozen in "setup".
    expect(src).toMatch(/elements\.update\(\{\s*mode:\s*"payment"/);
    // The same identifier the "Due today" total prints, not a second sum —
    // two derivations off the same inputs is how the two end up disagreeing.
    expect(src).toMatch(/amount:\s*dueNow\b/);
    expect(src).toMatch(/money\(dueNow, offer\.currency\)/);
  });

  it("switches Elements to setup mode for a trial, reacting to price and coupon", () => {
    // Tied to elements.update, not the initial <Elements options>, which also
    // reads mode: "setup" and would pass this even unfixed.
    expect(src).toMatch(/elements\.update\(\{\s*mode:\s*"setup"/);
    // isRecurring has to GATE the branch, not just ride along in the deps
    // array — a one-time price and a no-trial recurring one can owe the same
    // dueNow, and only isRecurring tells startOfferCheckout's own two paths
    // apart. Tied to the literal `if (isRecurring)` guarding the setup call,
    // so swapping the condition to `dueNow <= 0` (deps array left untouched)
    // turns this red, which a bare deps-array match would not have caught.
    expect(src).toMatch(/if\s*\(isRecurring\)\s*\{\s*void elements\.update\(\{\s*mode:\s*"setup"/);
  });
});

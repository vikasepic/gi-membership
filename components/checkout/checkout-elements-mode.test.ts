import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("components/checkout/checkout-form.tsx", "utf8");

// Mirrors offer-elements-mode.test.ts exactly — same bug, same fix, on the
// product checkout. Elements used to be keyed on `totalNow <= 0`, but
// createCheckoutIntent (lib/checkout.ts) branches on the CHOSEN price's
// billingType, not on whether anything is due today. A no-trial recurring
// price has totalNow > 0 (its first period bills immediately) while the
// server still opens a SetupIntent — so the old keying put Elements in
// "payment" mode against a SetupIntent, and confirmSetup against that is a
// Stripe.js integration error. Latent in production today (zero recurring
// product prices are currently sold) but a real trap for the next one.
describe("the product form keeps Elements' mode in step with what it charges", () => {
  it("switches Elements to payment mode, with the same amount the page shows as due", () => {
    // Tied to elements.update specifically, not just the string "payment" —
    // the initial <Elements options> a few lines up also reads mode:
    // "payment", and a looser match would pass even with the effect frozen.
    expect(src).toMatch(/elements\.update\(\{\s*mode:\s*"payment"/);
    // The same identifier "Due today" (rendered via the slots' totalNow) is
    // built from, not a second sum computed here — two derivations off the
    // same inputs is how the two end up disagreeing.
    expect(src).toMatch(/amount:\s*totalNow\b/);
  });

  it("switches Elements to setup mode for a recurring price, trial or not", () => {
    // Tied to elements.update, not the initial <Elements options>, which also
    // reads mode: "setup" and would pass this even unfixed.
    expect(src).toMatch(/elements\.update\(\{\s*mode:\s*"setup"/);
    // isRecurring has to GATE the branch, not just ride along in the deps
    // array — a one-time price and a no-trial recurring one can owe the same
    // totalNow, and only isRecurring tells createCheckoutIntent's own two
    // paths apart. Tied to the literal `if (isRecurring)` guarding the setup
    // call, so swapping the condition back to `totalNow <= 0` (deps array
    // left untouched) turns this red, which a bare deps-array match would not
    // have caught.
    expect(src).toMatch(/if\s*\(isRecurring\)\s*\{\s*void elements\.update\(\{\s*mode:\s*"setup"/);
  });

  it("derives isRecurring from the CHOSEN price's billingType, not from the amount due", () => {
    expect(src).toMatch(/const isRecurring = chosenPrice\?\.billingType === "recurring"/);
  });
});

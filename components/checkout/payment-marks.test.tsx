import { readFileSync, statSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * The marks under the pay button.
 *
 * Replaced "Card, or whatever Stripe offers where you are — UPI, wallets,
 * bank transfer." on 10 Sep 2026. The sentence was true and nobody read it;
 * the marks are what a buyer scans for before typing a card number.
 */
const src = readFileSync("components/checkout/slots.tsx", "utf8");

describe("the payment marks", () => {
  it("replaced the sentence, everywhere", () => {
    expect(src).not.toContain("Card, or whatever Stripe offers");
    expect(src).toContain('src="/brand/payment-marks.webp"');
  });

  it("is sized by height, so the artwork's own ratio decides the width", () => {
    // A fixed width squeezes a 8.5:1 strip on a narrow column.
    expect(src).toContain('className="mx-auto h-6 w-auto max-w-full sm:h-7"');
  });

  it("declares its intrinsic size, so the checkout does not jump as it loads", () => {
    expect(src).toMatch(/width=\{840\}[\s\S]{0,40}height=\{99\}/);
  });

  it("names the marks for a screen reader rather than leaving it decorative", () => {
    // It is the only place the accepted methods are stated now.
    expect(src).toMatch(/alt="Visa, Mastercard, American Express, Apple Pay and Google Pay accepted"/);
  });

  it("is still the store's to hide, like the row it replaced", () => {
    const at = src.indexOf('src="/brand/payment-marks.webp"');
    expect(src.slice(Math.max(0, at - 400), at)).toContain("showRow &&");
  });

  it("ships an asset small enough for a checkout", () => {
    // The source PNG is 306KB; a badge strip has no business costing that on
    // the page that takes the money.
    const bytes = statSync("public/brand/payment-marks.webp").size;
    expect(bytes).toBeGreaterThan(2_000);
    expect(bytes).toBeLessThan(60_000);
  });
});

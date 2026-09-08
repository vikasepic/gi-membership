import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("components/checkout/offer-checkout-form.tsx", "utf8");

describe("the offer form confirms what the server opened", () => {
  it("branches on mode rather than always confirming a setup", () => {
    expect(src).toMatch(/res\.mode === "payment"/);
    expect(src).toMatch(/stripe\.confirmPayment\(/);
  });

  it("still has a setup path, for the trial that charges nothing today", () => {
    expect(src).toMatch(/stripe\.confirmSetup\(/);
  });
});

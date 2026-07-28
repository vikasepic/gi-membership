import { describe, it, expect } from "vitest";
import { needsTaxLocation, normalizeCountry, orderTotalCents } from "@/lib/tax";

describe("normalizeCountry", () => {
  it("uppercases a two-letter code", () => {
    expect(normalizeCountry("gb")).toBe("GB");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeCountry(" de ")).toBe("DE");
  });

  it("rejects anything that is not a 2-letter code", () => {
    expect(normalizeCountry("United Kingdom")).toBeNull();
    expect(normalizeCountry("")).toBeNull();
    expect(normalizeCountry(undefined)).toBeNull();
  });
});

describe("needsTaxLocation", () => {
  it("requires a country when tax is enabled", () => {
    // Stripe cannot calculate VAT without knowing where the buyer is.
    expect(needsTaxLocation(true, null)).toBe(true);
  });

  it("is satisfied once a country is supplied", () => {
    expect(needsTaxLocation(true, "GB")).toBe(false);
  });

  it("never blocks checkout when tax is disabled", () => {
    expect(needsTaxLocation(false, null)).toBe(false);
  });
});

describe("orderTotalCents", () => {
  it("adds tax on top of the product price", () => {
    // Prices are entered tax-EXCLUSIVE, so VAT is added rather than extracted.
    expect(orderTotalCents(2700, 540)).toBe(3240);
  });

  it("equals the price when there is no tax", () => {
    expect(orderTotalCents(2700, 0)).toBe(2700);
  });

  it("never returns less than the product price", () => {
    expect(orderTotalCents(2700, -100)).toBe(2700);
  });
});

import { describe, it, expect } from "vitest";
import { money } from "@/lib/money";

describe("money", () => {
  // The bug this function was extracted to fix: toFixed(0) advertised a $4.99
  // product as "$5" on the storefront while checkout charged $4.99.
  it("keeps cents when the price has them", () => {
    expect(money(499)).toBe("$4.99");
    expect(money(2799)).toBe("$27.99");
    expect(money(1)).toBe("$0.01");
  });

  it("drops the trailing .00 on whole amounts", () => {
    expect(money(2700)).toBe("$27");
    expect(money(4700)).toBe("$47");
    expect(money(0)).toBe("$0");
  });

  it("honours the currency", () => {
    expect(money(499, "eur")).toBe("€4.99");
    expect(money(2700, "GBP")).toBe("£27");
  });

  it("never rounds a price up", () => {
    // Any half-cent style rounding would overstate the price to the buyer.
    expect(money(1999)).toBe("$19.99");
    expect(money(950)).toBe("$9.50");
  });
});

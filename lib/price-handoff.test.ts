import { describe, it, expect } from "vitest";
import { priceForChoice, shownPrices, newOfferPrice, type OfferPrice } from "@/lib/offer-prices";

/**
 * The choice made on a sales page has to survive the journey to the checkout —
 * and it has to survive it WITHOUT being able to buy something it was not
 * shown.
 *
 * The link carries the price's id, which decides only which radio starts
 * ticked. What is CHARGED is resolved on the server from a list it rebuilt
 * itself, by index. So a tampered id can preselect nothing; it can never buy
 * anything.
 */

const price = (p: Partial<OfferPrice>): OfferPrice => ({ ...newOfferPrice("x"), ...p });
const MONTHLY = price({ id: "m", billingType: "recurring", interval: "month", priceCents: 1900 });
const YEARLY = price({ id: "y", billingType: "recurring", interval: "year", priceCents: 14900 });
const HIDDEN = price({ id: "h", priceCents: 100, archived: true });

describe("the price a sales page hands to the checkout", () => {
  const page = [MONTHLY, YEARLY, HIDDEN];
  const shown = shownPrices(page, ["m", "y"]);

  it("preselects the one that was chosen", () => {
    expect(shown.findIndex((p) => p.id === "y")).toBe(1);
  });

  it("preselects nothing for an id that is not on offer here", () => {
    // -1, which the form reads as "they arrived without choosing" — not as
    // index 0, which would silently pick the headline price for them.
    expect(shown.findIndex((p) => p.id === "h")).toBe(-1);
    expect(shown.findIndex((p) => p.id === "nonsense")).toBe(-1);
  });

  it("charges by index into the list the SERVER built, never by the id", () => {
    expect(priceForChoice(shown, 1)).toBe(YEARLY);
    // The hidden one is not in the shown list at all, so no index reaches it.
    expect(shown.some((p) => p.id === "h")).toBe(false);
  });

  it("refuses an index the list does not have", () => {
    expect(priceForChoice(shown, 2)).toBe(null);
    expect(priceForChoice(shown, -1)).toBe(null);
  });

  it("has nothing to choose when the page shows one price", () => {
    const one = shownPrices(page, ["m"]);
    expect(one).toHaveLength(1);
    expect(priceForChoice(one, 0)).toBe(MONTHLY);
  });
});

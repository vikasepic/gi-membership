import { describe, it, expect } from "vitest";
import {
  chargeNowCents,
  everyLabel,
  needsAnswer,
  newOfferPrice,
  priceForChoice,
  priceLabel,
  priceSummary,
  priceTerms,
  savingAgainst,
  shownPrices,
  sortPrices,
  type OfferPrice,
} from "@/lib/offer-prices";

const price = (p: Partial<OfferPrice>): OfferPrice => ({ ...newOfferPrice("x"), ...p });

const MONTHLY = price({ id: "m", billingType: "recurring", interval: "month", priceCents: 2900 });
const YEARLY = price({ id: "y", billingType: "recurring", interval: "year", priceCents: 29000 });
const ONCE = price({ id: "o", billingType: "one_time", priceCents: 49000 });

describe("what a price says it costs", () => {
  it("says the term, not just the money", () => {
    expect(priceLabel(MONTHLY, "usd")).toBe("$29/month");
    expect(priceLabel(ONCE, "usd")).toBe("$490");
  });

  it("counts the interval, which is what makes fortnightly possible", () => {
    const fortnightly = price({ billingType: "recurring", interval: "week", intervalCount: 2 });
    expect(everyLabel(fortnightly)).toBe("2 weeks");
    expect(priceLabel({ ...fortnightly, priceCents: 1500 }, "usd")).toBe("$15/2 weeks");
  });

  it("says what happens today when there is a trial", () => {
    const trial = { ...MONTHLY, trialDays: 7 };
    expect(priceTerms(trial, "usd")).toContain("7 days free");
    expect(chargeNowCents(trial)).toBe(0);
    expect(chargeNowCents(MONTHLY)).toBe(2900);
    expect(chargeNowCents(ONCE)).toBe(49000);
  });

  it("has nothing to add to a one-off", () => {
    expect(priceTerms(ONCE, "usd")).toBe(null);
  });

  it("puts a typed label in front of derived money, never instead of it", () => {
    // A sentence somebody wrote once outlives the next price change; the
    // figures beside it cannot.
    expect(priceSummary({ ...YEARLY, label: "Best value" }, "usd")).toContain("Best value —");
    expect(priceSummary({ ...YEARLY, label: "Best value" }, "usd")).toContain("$290/year");
  });
});

describe("which prices a placement shows", () => {
  const all = [MONTHLY, YEARLY, ONCE];

  it("falls back to the headline price when nothing is ticked", () => {
    // Which is exactly what every bump does today: one tickbox, one price.
    expect(shownPrices(all, [])).toEqual([MONTHLY]);
  });

  it("shows what was ticked, in the offer's order rather than the ticking order", () => {
    // A checkout must never present prices in an order the editor never saw.
    expect(shownPrices(all, ["o", "m"]).map((p) => p.id)).toEqual(["m", "o"]);
  });

  it("drops an archived price even when it is still named", () => {
    // Otherwise a hidden price keeps selling from a stale product row.
    const hidden = [{ ...MONTHLY, archived: true }, YEARLY];
    expect(shownPrices(hidden, ["m", "y"]).map((p) => p.id)).toEqual(["y"]);
  });

  it("falls back to the first LIVE price, not the first row", () => {
    expect(shownPrices([{ ...MONTHLY, archived: true }, YEARLY], [])).toEqual([YEARLY]);
  });
});

describe("what a click actually buys", () => {
  const shown = [MONTHLY, YEARLY];

  it("resolves an index against the list the server built", () => {
    expect(priceForChoice(shown, 1)).toBe(YEARLY);
    expect(priceForChoice(shown, "none")).toBe(null);
  });

  it("refuses anything outside that list rather than falling back", () => {
    // The invariant inherited from offerForChoice: the form sends an index,
    // never an id, so the only thing a tampered request can pick is something
    // it was already shown. Falling back to the default would charge somebody
    // for a thing they did not choose, which is the whole point of refusing.
    for (const bad of [-1, 2, 99, 1.5, NaN]) {
      expect(priceForChoice(shown, bad), String(bad)).toBe(null);
    }
  });

  it("refuses an archived price even at a valid index", () => {
    expect(priceForChoice([{ ...MONTHLY, archived: true }], 0)).toBe(null);
  });
});

describe("whether an answer is owed", () => {
  it("is owed only when there is something to choose between", () => {
    expect(needsAnswer(2, null)).toBe(true);
    expect(needsAnswer(2, "none")).toBe(false);
    expect(needsAnswer(2, 0)).toBe(false);
  });

  it("is never owed for one price — an unticked box IS none", () => {
    // Holding the pay button over a question nobody was asked is how a
    // checkout loses a sale it had already won.
    expect(needsAnswer(1, null)).toBe(false);
    expect(needsAnswer(0, null)).toBe(false);
  });
});

describe("what a longer term saves", () => {
  it("works it out per day, so it is not limited to month against year", () => {
    expect(savingAgainst(MONTHLY, YEARLY)).toBe("save 17%");
    const fortnightly = price({ billingType: "recurring", interval: "week", intervalCount: 2, priceCents: 1500 });
    expect(savingAgainst(fortnightly, YEARLY)).toBeTruthy();
  });

  it("refuses rather than inventing one", () => {
    // Dearer per day, one-off, or a rounding-error difference: say nothing.
    expect(savingAgainst(YEARLY, MONTHLY)).toBe(null);
    expect(savingAgainst(MONTHLY, ONCE)).toBe(null);
    expect(savingAgainst(MONTHLY, { ...YEARLY, priceCents: 34799 })).toBe(null);
  });
});

/**
 * What the database actually hands back.
 *
 * `offer_prices.label` is nullable there and not nullable here, and a
 * difference like that is invisible to tsc: the null arrives typed as a string
 * and the first `.trim()` throws. Every price the 0048 backfill created has
 * one, so this took down every admin screen that listed a price — the type was
 * green, the tests were green, the build was green, and a person found it.
 */
describe("hydrating a price row", () => {
  it("turns a null label into an empty one", () => {
    const [row] = sortPrices([{ id: "a", label: null as unknown as string, priceCents: 900 }]);
    expect(row.label).toBe("");
    expect(() => priceSummary(row, "usd")).not.toThrow();
  });

  it("fills in anything else the row is missing", () => {
    // A row selected with fewer columns, or an older row, must still come out
    // as a whole price rather than as something with holes in it.
    const [row] = sortPrices([{ id: "b" }]);
    expect(row).toMatchObject({ billingType: "one_time", intervalCount: 1, archived: false });
  });

  it("still orders by sortOrder and drops it", () => {
    const rows = sortPrices([
      { id: "second", sortOrder: 1 },
      { id: "first", sortOrder: 0 },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["first", "second"]);
    expect("sortOrder" in rows[0]).toBe(false);
  });
});

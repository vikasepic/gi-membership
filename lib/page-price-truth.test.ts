import { describe, it, expect } from "vitest";
import { contradicts, priceProblems, priceProblemMessage } from "@/lib/page-price-truth";
import { newBlock } from "@/lib/blocks";

// A page must not advertise a figure the checkout will not charge. This store
// has done it once already — a stored FAQ said $47 while the offer took $29.

describe("when a typed price contradicts the real one", () => {
  it("catches a plain disagreement", () => {
    expect(contradicts("$47", "$29")).toBe(true);
    expect(contradicts("47", "$29")).toBe(true);
  });

  it("allows the same figure written differently", () => {
    expect(contradicts("$29", "$29")).toBe(false);
    expect(contradicts("USD 29.00", "$29")).toBe(false);
    expect(contradicts("$29.00", "$29")).toBe(false);
  });

  it("reads thousands separators", () => {
    expect(contradicts("$1,299", "$1299")).toBe(false);
    expect(contradicts("$1,299", "$1199")).toBe(true);
  });

  it("leaves a range alone", () => {
    // "$29–$49" is not a claim that the price is one figure, so there is
    // nothing here to contradict.
    expect(contradicts("$29–$49", "$29")).toBe(false);
    expect(contradicts("$29 or $199", "$29")).toBe(false);
  });

  it("leaves prose alone rather than guessing", () => {
    // Blocking a save over a string nobody can parse is worse than the risk.
    expect(contradicts("Ask us", "$29")).toBe(false);
    expect(contradicts("", "$29")).toBe(false);
  });

  it("says nothing when the page has no real price to compare against", () => {
    expect(priceProblems([], "offer", null)).toEqual([]);
  });
});

describe("finding the offending cards", () => {
  const card = (price: string) => {
    const b = newBlock("pricecard");
    return { ...b, props: { ...b.props, price } };
  };

  it("finds a lying card", () => {
    const found = priceProblems([card("$47")], "offer", "$29");
    expect(found).toHaveLength(1);
    expect(found[0].typed).toBe("$47");
    expect(found[0].sectionKey).toBe("offer");
  });

  it("ignores a card left empty, which is how you ask for the real one", () => {
    expect(priceProblems([card("")], "offer", "$29")).toEqual([]);
  });

  it("ignores a card that agrees", () => {
    expect(priceProblems([card("$29")], "offer", "$29")).toEqual([]);
  });

  it("looks inside columns", () => {
    // A price card dragged into a two-column row is still on the page.
    const row = newBlock("row");
    row.columns = [[card("$47")], []];
    expect(priceProblems([row], "hero", "$29")).toHaveLength(1);
  });

  it("survives whatever is actually stored", () => {
    // The blocks come out of jsonb, so they are not to be trusted as Block[].
    expect(priceProblems(null, "offer", "$29")).toEqual([]);
    expect(priceProblems([{ nonsense: true }], "offer", "$29")).toEqual([]);
  });

  it("names both figures in the message, which is the whole point", () => {
    const msg = priceProblemMessage(priceProblems([card("$47")], "offer", "$29"))!;
    expect(msg).toContain("$47");
    expect(msg).toContain("$29");
  });

  it("counts the rest rather than listing them", () => {
    const msg = priceProblemMessage(priceProblems([card("$47"), card("$99")], "offer", "$29"))!;
    expect(msg).toContain("and 1 more");
  });

  it("says nothing when nothing is wrong", () => {
    expect(priceProblemMessage([])).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { buysSomething, countBuyControls, warnNotBuyable } from "@/lib/page-buyable";
import { newBlock, type Block } from "@/lib/blocks";

// A sales page that cannot be bought from renders perfectly and converts at
// zero. Nothing else in the system notices — the block is valid and the page
// is valid; only the money is missing.

const button = (props: Record<string, unknown>): Block => {
  const b = newBlock("button");
  return { ...b, props: { ...b.props, ...props } };
};
const card = (props: Record<string, unknown> = {}): Block => {
  const b = newBlock("pricecard");
  return { ...b, props: { ...b.props, ...props } };
};
const page = (...blocks: Block[][]) => blocks.map((b) => ({ content: { blocks: b } }));

describe("what counts as a way to buy", () => {
  it("a button set to Buy", () => {
    expect(buysSomething(button({ action: "buy", text: "Get access" }))).toBe(true);
  });

  it("not a button that goes to a link", () => {
    // The default. It looks like a button and does nothing to the checkout.
    expect(buysSomething(button({ action: "link", text: "See how it works" }))).toBe(false);
  });

  it("not a Buy button with no label — it renders nothing", () => {
    expect(buysSomething(button({ action: "buy", text: "" }))).toBe(false);
  });

  it("a price card with a button label", () => {
    expect(buysSomething(card({ ctaLabel: "Start the trial" }))).toBe(true);
  });

  it("not a price card with no button label", () => {
    expect(buysSomething(card({ ctaLabel: "" }))).toBe(false);
  });

  it("not a heading, however persuasive", () => {
    expect(buysSomething(newBlock("heading"))).toBe(false);
  });
});

describe("counting across a page", () => {
  it("adds up every section", () => {
    const p = page([button({ action: "buy", text: "Buy" })], [card({ ctaLabel: "Buy" })]);
    expect(countBuyControls(p)).toBe(2);
  });

  it("looks inside columns", () => {
    const row = newBlock("row");
    row.columns = [[button({ action: "buy", text: "Buy" })], []];
    expect(countBuyControls(page([row]))).toBe(1);
  });

  it("survives whatever is stored", () => {
    expect(countBuyControls([{ content: null }, { content: { blocks: "nonsense" } }])).toBe(0);
  });
});

describe("when to say something", () => {
  it("warns on a written page with no way to buy", () => {
    expect(warnNotBuyable(page([button({ action: "link", text: "Learn more" })]))).toBe(true);
  });

  it("says nothing once there is one", () => {
    expect(warnNotBuyable(page([button({ action: "buy", text: "Buy" })]))).toBe(false);
  });

  it("says nothing about a page nobody has written yet", () => {
    // An empty page is not a broken page, and a warning that sits there
    // through the whole of writing it is one people learn to ignore.
    expect(warnNotBuyable(page([]))).toBe(false);
    expect(warnNotBuyable([{ content: {} }])).toBe(false);
  });
});

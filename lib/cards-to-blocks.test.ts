import { describe, it, expect } from "vitest";
import { newBlock, normalizeBlocks, blockRendersNothing, type Block } from "@/lib/blocks";
import { explodeCards, explodeWarnings } from "@/lib/cards-to-blocks";

const cards = (props: Record<string, unknown> = {}): Block => {
  const b = newBlock("cards");
  return { ...b, props: { ...b.props, ...props } };
};

const item = (over: Record<string, unknown> = {}) => ({
  title: "A thing",
  body: "What it is.",
  icon: "",
  image: "",
  ...over,
});

const flat = (rows: Block[]) => rows.flatMap((r) => (r.columns ?? []).flat());

describe("taking a cards block apart", () => {
  it("gives every card its own column", () => {
    const rows = explodeCards(cards({ items: [item(), item(), item()], columns: 3 }));
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("row");
    expect(rows[0].columns).toHaveLength(3);
  });

  it("turns each part into a block someone can delete", () => {
    const rows = explodeCards(cards({ items: [item({ icon: "https://x/i.svg" })], columns: 1 }));
    // This is the whole point of the conversion: the icon, the title and the
    // body stop being fields on one block and become three blocks.
    expect(rows[0].columns![0].map((b) => b.type)).toEqual(["image", "heading", "text"]);
  });

  it("wraps to a second container when there are more cards than fit across", () => {
    const rows = explodeCards(cards({ items: Array.from({ length: 7 }, item), columns: 4 }));
    expect(rows.map((r) => r.columns!.length)).toEqual([4, 3]);
  });

  it("never asks a row for more columns than a row can hold", () => {
    // MAX_COLUMNS is 6, and setColumnCount silently clamps — a nine-card block
    // asking for nine columns would quietly lose three cards.
    const rows = explodeCards(cards({ items: Array.from({ length: 9 }, item), columns: 6 }));
    expect(rows.every((r) => r.columns!.length <= 6)).toBe(true);
    expect(flat(rows).filter((b) => b.type === "heading")).toHaveLength(9);
  });

  it("loses no card and no words", () => {
    const items = [item({ title: "One" }), item({ title: "Two" }), item({ title: "Three" })];
    const text = JSON.stringify(flat(explodeCards(cards({ items }))));
    for (const t of ["One", "Two", "Three", "What it is."]) expect(text).toContain(t);
  });

  it("emits nothing for a part that was empty", () => {
    // An empty image block is a gap on the live page and a thing to delete in
    // the editor. A card with no icon should produce no icon block.
    const rows = explodeCards(cards({ items: [item({ title: "T", body: "" })] }));
    expect(rows[0].columns![0].map((b) => b.type)).toEqual(["heading"]);
  });

  it("keeps an emoji as type, not as a picture", () => {
    const rows = explodeCards(cards({ items: [item({ icon: "★" })] }));
    const first = rows[0].columns![0][0];
    expect(first.type).toBe("heading");
    expect(first.props.text).toBe("★");
  });

  it("carries the card's box onto the column that replaces it", () => {
    const rows = explodeCards(
      cards({ items: [item()], skin: "boxed", cardPadding: 32, cardRadius: 8 }),
    );
    expect(rows[0].columnStyles?.[0]?.padding.t).toBe(32);
    expect(rows[0].columnStyles?.[0]?.radius).toBe(8);
  });

  it("gives an unboxed skin no box", () => {
    const rows = explodeCards(cards({ items: [item()], skin: "plain" }));
    expect(rows[0].columnStyles).toBeUndefined();
  });

  it("produces blocks that survive a round trip through storage", () => {
    // The editor holds these in state and the page reads them back through
    // normalize. A shape normalize rewrites is a design that changes on reload.
    const rows = explodeCards(cards({ items: [item({ icon: "https://x/i.svg" }), item()] }));
    expect(normalizeBlocks(JSON.parse(JSON.stringify(rows)))).toEqual(rows);
  });

  it("produces blocks the page will actually draw", () => {
    // `blockRendersNothing` drops empty blocks on save. A conversion whose
    // output it discards is a button that deletes your section.
    const rows = explodeCards(cards({ items: [item(), item()] }));
    expect(rows.some(blockRendersNothing)).toBe(false);
  });

  it("leaves a block that is not cards alone", () => {
    const h = newBlock("heading");
    expect(explodeCards(h)).toEqual([h]);
  });

  it("leaves an empty cards block alone rather than replacing it with nothing", () => {
    const empty = cards({ items: [] });
    expect(explodeCards(empty)).toEqual([empty]);
  });
});

describe("what the conversion says before it runs", () => {
  it("is silent when nothing is lost", () => {
    expect(explodeWarnings(cards({ items: [item()], columns: 3 }))).toEqual([]);
  });

  it("names the copy it cannot carry", () => {
    const w = explodeWarnings(cards({ items: [item()], skin: "list", title: "Included" }));
    expect(w.join(" ")).toContain("closing note");
  });

  it("warns that a beside icon moves above", () => {
    const w = explodeWarnings(cards({ items: [item()], iconPlace: "beside" }));
    expect(w.join(" ")).toContain("above");
  });

  it("warns about the divider it drops", () => {
    expect(explodeWarnings(cards({ items: [item()], divider: true })).join(" ")).toContain("Divider");
  });

  it("says nothing about a block that is not cards", () => {
    expect(explodeWarnings(newBlock("heading"))).toEqual([]);
  });
});

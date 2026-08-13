import { describe, it, expect } from "vitest";
import {
  BLOCK_TYPES,
  MAX_DEPTH,
  baseStyle,
  blockRendersNothing,
  blocksAreEmpty,
  duplicateBlock,
  findBlock,
  insertBlock,
  moveBlock,
  newBlock,
  normalizeBlocks,
  removeBlock,
  updateBlock,
  walkBlocks,
  type Block,
  duplicateColumn,
  removeColumn,
  MAX_COLUMNS,
  setColumnCount,
} from "@/lib/blocks";

const ids = (blocks: Block[]) => blocks.map((b) => b.id);

/** A row with two columns, the first holding one button. */
function rowWith(childId: string): Block {
  const row = newBlock("row");
  row.id = "row1";
  row.columns![0] = [{ ...newBlock("button"), id: childId }];
  return row;
}

describe("newBlock", () => {
  it("gives every type defaults it can render from", () => {
    for (const type of BLOCK_TYPES) {
      const b = newBlock(type);
      expect(b.type).toBe(type);
      expect(b.id).toMatch(/^b_/);
      expect(b.style).toMatchObject({ width: expect.any(String), blockAlign: expect.any(String) });
    }
  });

  it("gives a row one empty column per structure slot", () => {
    expect(newBlock("row").columns).toEqual([[], []]);
  });

  it("starts every colour null, so the band can repaint it", () => {
    // The prototype froze colours at creation, which is how a heading ended up
    // as dark ink on a navy band. null means inherit, and it has to be the
    // starting value or the bug comes back one block at a time.
    const s = newBlock("heading").style;
    expect(s.color).toBeNull();
    expect(s.size).toBeNull();
    expect(s.weight).toBeNull();
    expect(s.background.type).toBe("none");
  });

  it("hands out unique ids", () => {
    const seen = new Set(Array.from({ length: 200 }, () => newBlock("text").id));
    expect(seen.size).toBe(200);
  });
});

describe("normalizeBlocks — stored JSON is untrusted", () => {
  it("returns nothing for anything that is not an array", () => {
    for (const junk of [null, undefined, 0, "x", {}, true]) {
      expect(normalizeBlocks(junk)).toEqual([]);
    }
  });

  it("drops a block whose type has no renderer", () => {
    const out = normalizeBlocks([{ type: "heading" }, { type: "iframe" }, { type: 7 }, "nope", null]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("heading");
  });

  it("gives an id to a block stored without one", () => {
    expect(normalizeBlocks([{ type: "text" }])[0].id).toMatch(/^b_/);
  });

  it("keeps an id it was given", () => {
    expect(normalizeBlocks([{ type: "text", id: "keepme" }])[0].id).toBe("keepme");
  });

  it("fills missing props from the defaults rather than rendering undefined", () => {
    const b = normalizeBlocks([{ type: "heading", props: { text: "Mine" } }])[0];
    expect(b.props.text).toBe("Mine");
    expect(b.props.tag).toBe("h2");
  });

  it("rebuilds a row's columns to match its structure", () => {
    const b = normalizeBlocks([{ type: "row", props: { structure: "1-1-1" }, columns: [[{ type: "text" }]] }])[0];
    expect(b.columns).toHaveLength(3);
    expect(b.columns![0]).toHaveLength(1);
    expect(b.columns![1]).toEqual([]);
  });

  it("turns the structure into widths, so there is one description of the row", () => {
    const b = normalizeBlocks([{ type: "row", props: { structure: "3-2" } }])[0];
    expect(b.props.widths).toEqual([60, 40]);
    expect(b.props.structure).toBeUndefined();
  });

  it("keeps a column the structure does not know about, and its content", () => {
    const b = normalizeBlocks([
      { type: "row", props: { structure: "1-1" }, columns: [[], [], [{ type: "text" }]] },
    ])[0];
    expect(b.columns).toHaveLength(3);
    expect(b.columns![2]).toHaveLength(1);
  });

  it("falls back to a known structure when the stored one is nonsense", () => {
    const b = normalizeBlocks([{ type: "row", props: { structure: "9-9-9" } }])[0];
    expect(b.columns).toHaveLength(2);
    expect(b.props.widths).toEqual([50, 50]);
  });

  it("stops nesting at MAX_DEPTH instead of recursing on a self-referential tree", () => {
    // Build a row nested far deeper than allowed.
    let deep: unknown = { type: "text" };
    for (let i = 0; i < 8; i++) deep = { type: "row", props: { structure: "1" }, columns: [[deep]] };
    const out = normalizeBlocks([deep]);
    let level = 0;
    let node = out[0];
    while (node?.columns?.[0]?.[0]) {
      node = node.columns[0][0];
      level++;
    }
    expect(level).toBeLessThanOrEqual(MAX_DEPTH);
  });

  it("rejects a colour that is not a hex value, rather than letting it into a style attribute", () => {
    const b = normalizeBlocks([{ type: "heading", style: { color: "red; background:url(x)" } }])[0];
    expect(b.style.color).toBeNull();
  });

  it("keeps a real hex colour", () => {
    expect(normalizeBlocks([{ type: "heading", style: { color: "#B0532F" } }])[0].style.color).toBe("#B0532F");
  });

  it("coerces a corrupt dimension without throwing", () => {
    const b = normalizeBlocks([{ type: "text", style: { padding: { t: "x", r: null, b: 12 } } }])[0];
    expect(b.style.padding.t).toBe(baseStyle().padding.t);
    expect(b.style.padding.b).toBe(12);
    expect(b.style.padding.u).toBe("px");
  });

  it("survives a round trip through JSON", () => {
    const before = [newBlock("heading"), rowWith("kid")];
    const after = normalizeBlocks(JSON.parse(JSON.stringify(before)));
    expect(after).toEqual(before);
  });
});

describe("findBlock", () => {
  const tree = [newBlock("heading"), rowWith("kid")];

  it("finds a top-level block", () => {
    const f = findBlock(tree, tree[0].id)!;
    expect(f.parentId).toBeNull();
    expect(f.index).toBe(0);
  });

  it("finds one nested in a column, and says where", () => {
    const f = findBlock(tree, "kid")!;
    expect(f.parentId).toBe("row1");
    expect(f.column).toBe(0);
    expect(f.index).toBe(0);
  });

  it("returns null for an id that is not there", () => {
    expect(findBlock(tree, "ghost")).toBeNull();
  });
});

describe("insertBlock", () => {
  it("inserts at the root at the given index", () => {
    const a = newBlock("heading");
    const b = newBlock("text");
    const c = newBlock("button");
    const out = insertBlock([a, b], c, { zone: "root", index: 1 });
    expect(ids(out)).toEqual([a.id, c.id, b.id]);
  });

  it("clamps an index past the end instead of leaving a hole", () => {
    const a = newBlock("heading");
    const out = insertBlock([a], newBlock("text"), { zone: "root", index: 99 });
    expect(out).toHaveLength(2);
    expect(out[1].type).toBe("text");
  });

  it("inserts into the column it was aimed at", () => {
    const row = newBlock("row");
    const btn = newBlock("button");
    const out = insertBlock([row], btn, { zone: "column", rowId: row.id, column: 1, index: 0 });
    expect(out[0].columns![0]).toEqual([]);
    expect(out[0].columns![1][0].id).toBe(btn.id);
  });

  it("puts a container inside a column, one deep", () => {
    const row = newBlock("row");
    const inner = newBlock("row");
    const out = insertBlock([row], inner, { zone: "column", rowId: row.id, column: 0, index: 0 });
    expect(out[0].columns![0][0].id).toBe(inner.id);
  });

  it("refuses a second one — depth has to hold here too", () => {
    // normalizeBlocks enforces MAX_DEPTH on read. A third level would be
    // deleted on the next page load, which is the worst way to lose work:
    // after the editor has already said it saved.
    const row = newBlock("row");
    const inner = newBlock("row");
    const one = insertBlock([row], inner, { zone: "column", rowId: row.id, column: 0, index: 0 });
    const two = insertBlock(one, newBlock("row"), { zone: "column", rowId: inner.id, column: 0, index: 0 });
    expect(two).toEqual(one);
  });

  it("still puts ordinary blocks inside a nested container", () => {
    // Otherwise the container you just added is a box nothing can go in.
    const row = newBlock("row");
    const inner = newBlock("row");
    const one = insertBlock([row], inner, { zone: "column", rowId: row.id, column: 0, index: 0 });
    const kid = newBlock("heading");
    const two = insertBlock(one, kid, { zone: "column", rowId: inner.id, column: 1, index: 0 });
    expect(two[0].columns![0][0].columns![1][0].id).toBe(kid.id);
  });

  it("does not mutate the tree it was given", () => {
    const before = [newBlock("heading")];
    const snapshot = JSON.parse(JSON.stringify(before));
    insertBlock(before, newBlock("text"), { zone: "root", index: 0 });
    expect(before).toEqual(snapshot);
  });
});

describe("removeBlock", () => {
  it("removes a top-level block", () => {
    const a = newBlock("heading");
    const b = newBlock("text");
    expect(ids(removeBlock([a, b], a.id))).toEqual([b.id]);
  });

  it("removes one nested in a column", () => {
    const out = removeBlock([rowWith("kid")], "kid");
    expect(out[0].columns![0]).toEqual([]);
  });

  it("leaves the tree alone for an unknown id", () => {
    const tree = [newBlock("heading")];
    expect(removeBlock(tree, "ghost")).toEqual(tree);
  });
});

describe("moveBlock", () => {
  it("moving down lands where it was dropped, not one short", () => {
    // The off-by-one: removing first shifts every index above the old one, so
    // inserting against the original index puts the block one slot early.
    const [a, b, c] = [newBlock("heading"), newBlock("text"), newBlock("button")];
    const out = moveBlock([a, b, c], a.id, { zone: "root", index: 2 });
    expect(ids(out)).toEqual([b.id, a.id, c.id]);
  });

  it("moving to the very end works", () => {
    const [a, b, c] = [newBlock("heading"), newBlock("text"), newBlock("button")];
    const out = moveBlock([a, b, c], a.id, { zone: "root", index: 3 });
    expect(ids(out)).toEqual([b.id, c.id, a.id]);
  });

  it("moving up does not need the adjustment", () => {
    const [a, b, c] = [newBlock("heading"), newBlock("text"), newBlock("button")];
    const out = moveBlock([a, b, c], c.id, { zone: "root", index: 0 });
    expect(ids(out)).toEqual([c.id, a.id, b.id]);
  });

  it("moves a root block into a column", () => {
    const row = newBlock("row");
    const btn = newBlock("button");
    const out = moveBlock([row, btn], btn.id, { zone: "column", rowId: row.id, column: 1, index: 0 });
    expect(out).toHaveLength(1);
    expect(out[0].columns![1][0].id).toBe(btn.id);
  });

  it("moves a block back out of a column to the root", () => {
    const tree = [rowWith("kid")];
    const out = moveBlock(tree, "kid", { zone: "root", index: 0 });
    expect(ids(out)).toEqual(["kid", "row1"]);
    expect(out[1].columns![0]).toEqual([]);
  });

  it("moves between two columns of the same row", () => {
    const out = moveBlock([rowWith("kid")], "kid", { zone: "column", rowId: "row1", column: 1, index: 0 });
    expect(out[0].columns![0]).toEqual([]);
    expect(out[0].columns![1][0].id).toBe("kid");
  });

  it("drags a container into a column", () => {
    const row = newBlock("row");
    const other = newBlock("row");
    const out = moveBlock([row, other], other.id, { zone: "column", rowId: row.id, column: 0, index: 0 });
    expect(ids(out)).toEqual([row.id]);
    expect(out[0].columns![0][0].id).toBe(other.id);
  });

  it("will not drag one into a column that is already inside a container", () => {
    const row = newBlock("row");
    const inner = newBlock("row");
    const loose = newBlock("row");
    const tree = insertBlock([row, loose], inner, { zone: "column", rowId: row.id, column: 0, index: 0 });
    const out = moveBlock(tree, loose.id, { zone: "column", rowId: inner.id, column: 0, index: 0 });
    expect(out).toEqual(tree);
  });

  it("ignores an id that is not in the tree", () => {
    const tree = [newBlock("heading")];
    expect(moveBlock(tree, "ghost", { zone: "root", index: 0 })).toEqual(tree);
  });
});

describe("duplicateBlock", () => {
  it("puts the copy directly after the original", () => {
    const [a, b] = [newBlock("heading"), newBlock("text")];
    const out = duplicateBlock([a, b], a.id);
    expect(out).toHaveLength(3);
    expect(out[1].type).toBe("heading");
    expect(out[2].id).toBe(b.id);
  });

  it("gives the copy a new id", () => {
    const a = newBlock("heading");
    const out = duplicateBlock([a], a.id);
    expect(out[1].id).not.toBe(a.id);
  });

  it("gives new ids to nested children too, so editing the copy leaves the original alone", () => {
    const out = duplicateBlock([rowWith("kid")], "row1");
    const copy = out[1];
    expect(copy.id).not.toBe("row1");
    expect(copy.columns![0][0].id).not.toBe("kid");
    expect(copy.columns![0][0].type).toBe("button");
  });

  it("copies props rather than sharing them", () => {
    const a = newBlock("heading");
    const out = duplicateBlock([a], a.id);
    out[1].props.text = "changed";
    expect(out[0].props.text).toBe("Your heading");
  });

  it("duplicates a block that lives in a column, into that column", () => {
    const out = duplicateBlock([rowWith("kid")], "kid");
    expect(out[0].columns![0]).toHaveLength(2);
  });
});

describe("updateBlock", () => {
  it("patches a top-level block", () => {
    const a = newBlock("heading");
    const out = updateBlock([a], a.id, (b) => ({ ...b, props: { ...b.props, text: "New" } }));
    expect(out[0].props.text).toBe("New");
  });

  it("patches one nested in a column", () => {
    const out = updateBlock([rowWith("kid")], "kid", (b) => ({ ...b, props: { ...b.props, text: "Buy" } }));
    expect(out[0].columns![0][0].props.text).toBe("Buy");
  });

  it("does not mutate the original", () => {
    const a = newBlock("heading");
    const tree = [a];
    updateBlock(tree, a.id, (b) => ({ ...b, props: { ...b.props, text: "New" } }));
    expect(tree[0].props.text).toBe("Your heading");
  });
});

describe("walkBlocks and blocksAreEmpty", () => {
  it("walks nested blocks in reading order", () => {
    const tree = [newBlock("heading"), rowWith("kid")];
    expect(walkBlocks(tree).map((b) => b.type)).toEqual(["heading", "row", "button"]);
  });

  it("an empty canvas is empty", () => {
    expect(blocksAreEmpty([])).toBe(true);
  });

  it("a row with nothing in it still counts as content — someone placed it", () => {
    expect(blocksAreEmpty([newBlock("row")])).toBe(false);
  });
});

describe("blockRendersNothing", () => {
  const filled = (type: Parameters<typeof newBlock>[0], props: Record<string, unknown>) => ({
    ...newBlock(type),
    props: { ...newBlock(type).props, ...props },
  });

  it("calls an unfilled block empty", () => {
    expect(blockRendersNothing(filled("heading", { text: "  " }))).toBe(true);
    expect(blockRendersNothing(filled("image", { url: "" }))).toBe(true);
    expect(blockRendersNothing(filled("iconlist", { items: [] }))).toBe(true);
    expect(blockRendersNothing(filled("slides", { items: [] }))).toBe(true);
    expect(blockRendersNothing(filled("html", { code: "   " }))).toBe(true);
    expect(blockRendersNothing(filled("button", { text: "" }))).toBe(true);
  });

  it("sees through empty rich-text markup", () => {
    expect(blockRendersNothing(filled("text", { html: "<p></p>" }))).toBe(true);
    expect(blockRendersNothing(filled("text", { html: "<p>Real</p>" }))).toBe(false);
  });

  it("keeps a video that has only a poster", () => {
    expect(blockRendersNothing(filled("video", { url: "", poster: "https://x.test/p.jpg" }))).toBe(false);
  });

  it("never calls a spacer or divider empty — occupying space is their job", () => {
    expect(blockRendersNothing(newBlock("spacer"))).toBe(false);
    expect(blockRendersNothing(newBlock("divider"))).toBe(false);
  });

  it("calls a row empty only when everything in it is empty", () => {
    const row = newBlock("row");
    expect(blockRendersNothing(row)).toBe(true);
    row.columns![0] = [filled("heading", { text: "" })];
    expect(blockRendersNothing(row)).toBe(true);
    row.columns![1] = [filled("heading", { text: "Real" })];
    expect(blockRendersNothing(row)).toBe(false);
  });
});

/**
 * Duplicating a column, which the count dropdown could never do.
 *
 * "More columns" adds an EMPTY one and resets every width to even — so using it
 * to copy a 70/30 hero column loses the content and the layout in one move.
 */
describe("duplicateColumn", () => {
  const hero = () => {
    let row = setColumnCount(newBlock("row"), 2);
    row = { ...row, props: { ...row.props, widths: [70, 30] } };
    row.columns![0] = [newBlock("heading")];
    row.columns![1] = [newBlock("image")];
    return row;
  };

  it("copies the blocks, with ids of their own", () => {
    const row = hero();
    const out = duplicateColumn(row, 0);
    expect(out.columns).toHaveLength(3);
    expect(out.columns![1][0].type).toBe("heading");
    // The same block twice would mean editing one edits both.
    expect(out.columns![1][0].id).not.toBe(row.columns![0][0].id);
  });

  it("puts the copy directly beside the original", () => {
    const out = duplicateColumn(hero(), 0);
    expect(out.columns![2][0].type).toBe("image");
  });

  it("splits that column's width, so nothing else moves", () => {
    // 70/30 becomes 35/35/30. The column that was not involved is untouched,
    // which is what makes the copy feel like it took its place.
    expect(duplicateColumn(hero(), 0).props.widths).toEqual([35, 35, 30]);
  });

  it("keeps the column's own styling with it", () => {
    const row = { ...hero(), columnStyles: [{ tag: "left" }, { tag: "right" }] } as unknown as Block;
    const out = duplicateColumn(row, 0);
    expect((out.columnStyles as unknown[])![1]).toEqual({ tag: "left" });
    expect((out.columnStyles as unknown[])![2]).toEqual({ tag: "right" });
  });

  it("refuses past the column limit rather than silently doing nothing else", () => {
    const full = setColumnCount(newBlock("row"), MAX_COLUMNS);
    expect(duplicateColumn(full, 0)).toBe(full);
  });
});

describe("removeColumn", () => {
  const three = () => {
    const row = setColumnCount(newBlock("row"), 3);
    return { ...row, props: { ...row.props, widths: [50, 25, 25] } };
  };

  it("gives the width to the neighbour, not to everyone", () => {
    expect(removeColumn(three(), 1).props.widths).toEqual([75, 25]);
  });

  it("hands the first column's width to the one that follows it", () => {
    expect(removeColumn(three(), 0).props.widths).toEqual([75, 25]);
  });

  it("will not empty the row", () => {
    const one = setColumnCount(newBlock("row"), 1);
    expect(removeColumn(one, 0)).toBe(one);
  });
});

/**
 * A container inside a column, which is what a hero with a two-column strip
 * beside its picture actually is. One level, never two.
 */
describe("a nested container survives a save", () => {
  it("comes back with its blocks after normalize", () => {
    // The failure that mattered: the editor accepts it, the page saves, and the
    // next read silently drops it because MAX_DEPTH was exceeded.
    const outer = newBlock("row");
    const inner = newBlock("row");
    const kid = newBlock("heading");
    let tree = insertBlock([outer], inner, { zone: "column", rowId: outer.id, column: 0, index: 0 });
    tree = insertBlock(tree, kid, { zone: "column", rowId: inner.id, column: 1, index: 0 });

    const round = normalizeBlocks(JSON.parse(JSON.stringify(tree)));
    expect(round[0].columns![0][0].type).toBe("row");
    expect(round[0].columns![0][0].columns![1][0].id).toBe(kid.id);
  });

  it("can be found, updated and removed from where it sits", () => {
    const outer = newBlock("row");
    const inner = newBlock("row");
    const kid = newBlock("heading");
    let tree = insertBlock([outer], inner, { zone: "column", rowId: outer.id, column: 0, index: 0 });
    tree = insertBlock(tree, kid, { zone: "column", rowId: inner.id, column: 0, index: 0 });

    expect(findBlock(tree, kid.id)?.parentId).toBe(inner.id);
    const edited = updateBlock(tree, kid.id, (b) => ({ ...b, props: { ...b.props, text: "hi" } }));
    expect(findBlock(edited, kid.id)?.block.props.text).toBe("hi");
    expect(findBlock(removeBlock(edited, kid.id), kid.id)).toBe(null);
  });
});

import { describe, it, expect } from "vitest";
import { newBlock, reid, insertBlock, walkBlocks, normalizeBlocks } from "@/lib/blocks";

/**
 * A pasted block must be its own block.
 *
 * Paste puts JSON copied from somewhere else into this tree, and that JSON
 * carries the ids it had over there. Two blocks answering to one id is not a
 * cosmetic problem: selecting either selects the first, and deleting either
 * deletes the first, so the one you can see stops responding and the one you
 * cannot is what you edit.
 */
describe("pasting a block", () => {
  it("gives the copy new ids", () => {
    const original = newBlock("text");
    const copy = reid(original);
    expect(copy.id).not.toBe(original.id);
  });

  it("gives every block inside a row new ids too", () => {
    const row = newBlock("row");
    row.columns = [[newBlock("text")], [newBlock("heading")]];
    const copy = reid(row);

    const before = walkBlocks([row]).map((b) => b.id);
    const after = walkBlocks([copy]).map((b) => b.id);
    expect(after).toHaveLength(before.length);
    for (const id of after) expect(before).not.toContain(id);
  });

  it("does not share style objects with the block it came from", () => {
    // A copy that shared them would follow the original around: change the
    // padding here and it changes over there.
    const original = newBlock("text");
    const copy = reid(original);
    copy.style.padding.l = 99;
    expect(original.style.padding.l).not.toBe(99);
  });

  it("survives being normalised on the way in", () => {
    // Paste runs the JSON through the same reader the database does, because
    // it may have come from an older page or a different tab.
    const copy = reid(normalizeBlocks([newBlock("text")])[0]);
    const tree = insertBlock([], copy, { zone: "root", index: 0 });
    expect(walkBlocks(tree)).toHaveLength(1);
    expect(tree[0].id).toBe(copy.id);
  });

  it("keeps ids unique once pasted beside the original", () => {
    const original = newBlock("text");
    const tree = insertBlock([original], reid(original), { zone: "root", index: 1 });
    const ids = walkBlocks(tree).map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

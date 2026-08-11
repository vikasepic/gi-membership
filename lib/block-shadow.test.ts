import { describe, it, expect } from "vitest";
import { newBlock, normalizeBlocks, setColumnCount, baseStyle, type Block } from "@/lib/blocks";
import { blockCssAt, columnCss } from "@/lib/block-style";
import { bandTheme } from "@/lib/page-sections";

// The shadow, which exists because six of the reference designs cast one and
// the only way to draw it was Custom CSS — invisible to every control, so the
// inspector then disagreed with the page about what the block looked like.

const paper = bandTheme("paper");
const navy = bandTheme("navy");

const withStyle = (over: Record<string, unknown>): Block => {
  const b = newBlock("heading");
  return { ...b, style: { ...b.style, ...over } };
};

describe("a block's shadow", () => {
  it("draws nothing when nothing is set", () => {
    // Every block ever saved is in this state, so this is the test that says
    // the feature shipped invisibly.
    expect(blockCssAt(newBlock("heading"), paper).boxShadow).toBeUndefined();
  });

  it("still draws nothing when only a colour is chosen", () => {
    // A colour with no offset and no blur paints no pixels. Emitting it would
    // cost a repaint to show nothing.
    expect(blockCssAt(withStyle({ shadowColor: "#ff0000" }), paper).boxShadow).toBeUndefined();
  });

  it("draws a hard edge when the blur is zero", () => {
    // The shape the chat bubbles want: a second card peeking out from behind.
    const css = blockCssAt(withStyle({ shadowX: -8, shadowY: 8, shadowColor: "#6b2a5e" }), paper);
    expect(css.boxShadow).toBe("-8px 8px 0px #6b2a5e");
  });

  it("draws a soft lift when the blur is raised", () => {
    const css = blockCssAt(
      withStyle({ shadowX: 0, shadowY: 12, shadowBlur: 32, shadowColor: "#00000022" }),
      paper,
    );
    expect(css.boxShadow).toBe("0px 12px 32px #00000022");
  });

  it("follows the band when it names no colour", () => {
    // Derived at render, never frozen at creation: a shadow fixed when the
    // block was made would keep its paper colour after the section went navy.
    const block = withStyle({ shadowY: 6, shadowBlur: 12 });
    expect(blockCssAt(block, paper).boxShadow).toContain(paper.rule);
    expect(blockCssAt(block, navy).boxShadow).toContain(navy.rule);
    expect(blockCssAt(block, paper).boxShadow).not.toBe(blockCssAt(block, navy).boxShadow);
  });

  it("takes the corner with it even on an unfilled box", () => {
    // Otherwise a bordered card with a hard offset casts a square shadow
    // behind a rounded outline.
    const css = blockCssAt(withStyle({ shadowX: 6, shadowY: 6, radius: 16 }), paper);
    expect(css.borderRadius).toBe("16px");
  });

  it("survives a save and a reload unchanged", () => {
    const [back] = normalizeBlocks([withStyle({ shadowX: -8, shadowY: 8, shadowBlur: 0, shadowColor: "#6b2a5e" })]);
    expect(back.style.shadowX).toBe(-8);
    expect(back.style.shadowY).toBe(8);
    expect(back.style.shadowColor).toBe("#6b2a5e");
  });

  it("clamps what would land in a style attribute", () => {
    const [back] = normalizeBlocks([withStyle({ shadowX: 9999, shadowY: -9999, shadowBlur: -40 })]);
    expect(back.style.shadowX).toBe(64);
    expect(back.style.shadowY).toBe(-64);
    // Blur cannot go negative; the offsets can, because a shadow cast up and to
    // the left is what an overlapping card does.
    expect(back.style.shadowBlur).toBe(0);
  });
});

describe("a column's shadow", () => {
  it("casts one, because a card in a set of cards IS a column", () => {
    const row = setColumnCount(newBlock("row"), 2);
    const withShadow: Block = {
      ...row,
      columnStyles: [baseStyle({ shadowY: 10, shadowBlur: 24, shadowColor: "#0000001a" }), baseStyle()],
    };
    expect(columnCss(withShadow, 0, paper).boxShadow).toBe("0px 10px 24px #0000001a");
    expect(columnCss(withShadow, 1, paper).boxShadow).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import { newBlock, normalizeBlocks, setColumnCount, baseStyle, type Block } from "@/lib/blocks";
import { blockCssAt, columnCss } from "@/lib/block-style";
import { bandTheme } from "@/lib/page-sections";

// The box a block draws around itself: its border's edges, and its shadow.
//
// Both exist because the reference designs need them and Custom CSS was the
// only way to draw either — and Custom CSS is invisible to every control, so
// the inspector then disagrees with the page about what the block looks like.

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

describe("which edges a border is drawn on", () => {
  it("emits the shorthand it always emitted when it is all four", () => {
    // Every border ever saved is in this state. A different property name here
    // would repaint nothing and still break every byte-for-byte golden.
    const css = blockCssAt(withStyle({ borderWidth: 1, borderColor: "#dddddd" }), paper);
    expect(css.border).toBe("1px solid #dddddd");
    expect(css.borderLeft).toBeUndefined();
  });

  it("draws one edge, which is what a rule between things is", () => {
    // The hairline separating two figures in a counter strip: a border on the
    // left of every figure but the first.
    const css = blockCssAt(
      withStyle({ borderWidth: 1, borderColor: "#9a9a9a", borderSides: "left" }),
      paper,
    );
    expect(css.borderLeft).toBe("1px solid #9a9a9a");
    expect(css.border).toBeUndefined();
    expect(css.borderRight).toBeUndefined();
  });

  it("draws a pair", () => {
    const css = blockCssAt(withStyle({ borderWidth: 2, borderSides: "y", borderColor: "#000000" }), paper);
    expect(css.borderTop).toBe("2px solid #000000");
    expect(css.borderBottom).toBe("2px solid #000000");
    expect(css.borderLeft).toBeUndefined();
  });

  it("draws nothing at all when the width is zero, whichever edge is named", () => {
    const css = blockCssAt(withStyle({ borderWidth: 0, borderSides: "bottom" }), paper);
    expect(css.borderBottom).toBeUndefined();
    expect(css.border).toBeUndefined();
  });

  it("follows the band when it names no colour", () => {
    const block = withStyle({ borderWidth: 1, borderSides: "bottom" });
    expect(blockCssAt(block, paper).borderBottom).toContain(paper.rule);
    expect(blockCssAt(block, navy).borderBottom).toContain(navy.rule);
  });

  it("reads back as it was written", () => {
    const [back] = normalizeBlocks([withStyle({ borderWidth: 3, borderSides: "left" })]);
    expect(back.style.borderSides).toBe("left");
    // An edge nobody understands is a box, not a crash.
    const [bad] = normalizeBlocks([withStyle({ borderWidth: 3, borderSides: "diagonal" })]);
    expect(bad.style.borderSides).toBe("all");
  });

  it("works on a column, where the counter strip's rules actually live", () => {
    const row = setColumnCount(newBlock("row"), 3);
    const withRules: Block = {
      ...row,
      columnStyles: [
        baseStyle(),
        baseStyle({ borderWidth: 1, borderSides: "left", borderColor: "#9a9a9a" }),
        baseStyle({ borderWidth: 1, borderSides: "left", borderColor: "#9a9a9a" }),
      ],
    };
    expect(columnCss(withRules, 0, paper).borderLeft).toBeUndefined();
    expect(columnCss(withRules, 1, paper).borderLeft).toBe("1px solid #9a9a9a");
    expect(columnCss(withRules, 2, paper).borderLeft).toBe("1px solid #9a9a9a");
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

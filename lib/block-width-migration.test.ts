import { describe, it, expect } from "vitest";
import { normalizeBlocks, newBlock, setStyleAt } from "@/lib/blocks";
import { blockWrapperCss, blockRules } from "@/lib/block-style";
import { bandTheme } from "@/lib/page-sections";

/**
 * Every sales page in the database was saved under the old width scale, which
 * stored five words: fit, narrow, normal, wide, full. Two of them — wide and
 * full — rendered the identical 100%, which is why there was no step between a
 * reading measure and the whole page, and why people reached for side padding
 * instead. Side padding is inherited by the phone and cannot shrink, so the
 * page that looked right on a laptop broke on a handset.
 *
 * Reading an old block must produce the same CSS it produced before. If any of
 * these change, live pages move.
 */
const paper = bandTheme("paper");

const stored = (style: Record<string, unknown>) =>
  normalizeBlocks([{ id: "b1", type: "text", props: { html: "<p>x</p>" }, style }])[0];

describe("blocks saved under the old width scale", () => {
  it("keeps narrow and normal as the measures they were", () => {
    // In `ch`, deliberately. The unit picker offers % and px, but converting
    // these on read would be a visible change on every page: `ch` scales with
    // font size, so 62ch is a measure on a paragraph and no constraint at all
    // on a 40px heading. They stay until someone sets a new width.
    expect(blockWrapperCss(stored({ width: "narrow" }), paper).maxWidth).toBe("38ch");
    expect(blockWrapperCss(stored({ width: "normal" }), paper).maxWidth).toBe("62ch");
  });

  it("keeps wide and full as no cap at all, which is what both rendered", () => {
    expect(blockWrapperCss(stored({ width: "wide" }), paper).maxWidth).toBeUndefined();
    expect(blockWrapperCss(stored({ width: "full" }), paper).maxWidth).toBeUndefined();
  });

  it("keeps hug-content hugging", () => {
    expect(blockWrapperCss(stored({ width: "fit" }), paper).maxWidth).toBe("fit-content");
  });

  it("carries the one old align into both new controls", () => {
    // One switch used to set the text and move the box. An old block has to
    // keep doing both or every centred heading on every page shifts left.
    const b = stored({ width: "normal", align: "center" });
    expect(b.style.textAlign).toBe("center");
    expect(b.style.blockAlign).toBe("center");

    const css = blockWrapperCss(b, paper);
    expect(css.textAlign).toBe("center");
    expect(css.marginLeft).toBe("auto");
    expect(css.marginRight).toBe("auto");
  });

  it("prefers a new value over the old one when both are present", () => {
    // A block saved after the split, then read by code that still sees `align`.
    const b = stored({ align: "center", textAlign: "left", blockAlign: "center" });
    expect(b.style.textAlign).toBe("left");
    expect(b.style.blockAlign).toBe("center");
  });

  it("refuses a width the editor cannot express", () => {
    expect(stored({ width: "enormous" }).style.width).toBe("auto");
    expect(stored({ width: "custom", maxWidthValue: -5 }).style.maxWidthValue).toBeNull();
    expect(stored({ width: "custom", maxWidthValue: 60, maxWidthUnit: "furlongs" }).style.maxWidthUnit).toBe("px");
  });
});

describe("a new text block", () => {
  it("starts at a measure, centred, with the words left", () => {
    // The shape people were building by hand with padding.
    const s = newBlock("text").style;
    expect(s.width).toBe("custom");
    expect(s.maxWidthUnit).toBe("px");
    expect(s.blockAlign).toBe("center");
    expect(s.textAlign).toBe("left");
  });

  it("does not impose a measure on things that are not running text", () => {
    for (const type of ["image", "button", "row", "video"] as const) {
      expect(newBlock(type).style.width).toBe("auto");
    }
  });
});

describe("side padding on a phone", () => {
  const pad = (l: number, r: number, u = "px") =>
    normalizeBlocks([
      {
        id: "b1",
        type: "text",
        props: { html: "<p>x</p>" },
        style: { padding: { t: 0, r, b: 0, l, u, link: false } },
      },
    ])[0];

  it("caps what the phone inherited, so it cannot eat the screen", () => {
    // 160px each side leaves 70px of column on a 390px handset.
    const css = blockRules(pad(160, 160), paper);
    expect(css).toContain("padding-left:min(160px,6vw)");
    expect(css).toContain("padding-right:min(160px,6vw)");
  });

  it("leaves a padding that already fits alone", () => {
    expect(blockRules(pad(16, 16), paper)).not.toContain("6vw");
  });

  it("does not touch top and bottom, which no screen is short of", () => {
    const tall = normalizeBlocks([
      { id: "b1", type: "text", props: {}, style: { padding: { t: 200, r: 0, b: 200, l: 0, u: "px", link: false } } },
    ])[0];
    expect(blockRules(tall, paper)).not.toContain("6vw");
  });

  it("respects a padding set at mobile on purpose", () => {
    // A decision the editor quietly overrules is worse than the problem.
    const b = setStyleAt(pad(160, 160), "mobile", {
      padding: { t: 0, r: 40, b: 0, l: 40, u: "px", link: false },
    });
    expect(blockRules(b, paper)).not.toContain("6vw");
  });
});

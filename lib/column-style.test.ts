import { describe, it, expect } from "vitest";
import {
  newBlock,
  normalizeBlocks,
  columnAsBlock,
  setColumnStyle,
  splitColumnId,
  baseStyle,
  emptyBackground,
} from "@/lib/blocks";
import { columnCss, backgroundCss } from "@/lib/block-style";
import { bandTheme } from "@/lib/page-sections";
import { COLUMN_CONTROLS, writeControl } from "@/lib/block-controls";

const theme = bandTheme("paper");
const row2 = () => {
  const r = newBlock("row");
  r.columns = [[], []];
  return r;
};

// A column was a bare array with nowhere to put anything, so it could not have
// a background, a padding or a corner — the three things people reach for the
// moment they put two columns side by side.

describe("a column's identity", () => {
  it("reads back the row and the index", () => {
    expect(splitColumnId("b_123#1")).toEqual({ rowId: "b_123", index: 1 });
  });

  it("is not confused by a block id", () => {
    expect(splitColumnId("b_123")).toBeNull();
  });

  it("survives an id that itself contains a hash", () => {
    // lastIndexOf, not indexOf: the index is always the last part.
    expect(splitColumnId("odd#id#2")).toEqual({ rowId: "odd#id", index: 2 });
  });

  it("refuses a nonsense index", () => {
    expect(splitColumnId("b_1#x")).toBeNull();
    expect(splitColumnId("b_1#-1")).toBeNull();
  });
});

describe("editing one column", () => {
  it("writes only that column", () => {
    const row = row2();
    const styled = setColumnStyle(row, 1, baseStyle({ radius: 12 }));
    expect(styled.columnStyles?.[0]).toBeNull();
    expect(styled.columnStyles?.[1]?.radius).toBe(12);
  });

  it("goes through the same controls every block uses", () => {
    // A synthetic block rather than a second set of readers and writers: two
    // sets is how the two drift apart.
    const row = row2();
    const bg = COLUMN_CONTROLS.find((c) => "key" in c && c.key === "background.color")!;
    const edited = writeControl(columnAsBlock(row, 0), bg, "#ff0000");
    const next = setColumnStyle(row, 0, edited.style);
    expect(next.columnStyles?.[0]?.background.color).toBe("#ff0000");
  });

  it("leaves an unstyled row storing nothing", () => {
    // An array of defaults on every row on every page, for nothing.
    expect(row2().columnStyles).toBeUndefined();
  });

  it("draws nothing for a column nobody has touched", () => {
    expect(columnCss(row2(), 0, theme)).toEqual({});
  });
});

describe("what a styled column draws", () => {
  it("paints its background", () => {
    const row = setColumnStyle(row2(), 0, baseStyle({
      background: { ...emptyBackground(), type: "classic", color: "#eeeeee" },
    }));
    expect(columnCss(row, 0, theme).backgroundColor).toBe("#eeeeee");
  });

  it("carries an image", () => {
    const row = setColumnStyle(row2(), 0, baseStyle({
      background: { ...emptyBackground(), type: "classic", image: "https://x.test/a.webp" },
    }));
    expect(String(columnCss(row, 0, theme).backgroundImage)).toContain("a.webp");
  });

  it("clips its corner only when there is something to clip", () => {
    const plain = setColumnStyle(row2(), 0, baseStyle({ radius: 12 }));
    expect(columnCss(plain, 0, theme).overflow).toBeUndefined();
    const painted = setColumnStyle(row2(), 0, baseStyle({
      radius: 12,
      background: { ...emptyBackground(), type: "classic", color: "#eee" },
    }));
    expect(painted && columnCss(painted, 0, theme).overflow).toBe("hidden");
  });
});

describe("the darkening wash", () => {
  const withImage = (overlay: number) =>
    backgroundCss({ ...emptyBackground(), type: "classic", image: "https://x.test/a.webp", overlay }, theme);

  it("is absent at zero", () => {
    const css = withImage(0);
    expect(String(css.backgroundImage)).not.toContain("gradient");
  });

  it("rides in front of the image", () => {
    // One property carries both, so nothing needs an extra element to sit in.
    const css = withImage(40);
    const img = String(css.backgroundImage);
    expect(img.indexOf("gradient")).toBeLessThan(img.indexOf("a.webp"));
    expect(img).toContain("rgba(0,0,0,0.4)");
  });

  it("keeps the image's own sizing behind it", () => {
    const css = withImage(40);
    expect(String(css.backgroundSize)).toBe("auto, cover");
    expect(String(css.backgroundRepeat)).toBe("no-repeat, no-repeat");
  });

  it("never blacks the picture out completely", () => {
    // 100 is a way to lose an image without noticing you have.
    const b = normalizeBlocks([
      { type: "heading", style: { background: { type: "classic", image: "x", overlay: 400 } } },
    ]);
    expect(b[0].style.background.overlay).toBe(90);
  });
});

describe("stored rows", () => {
  it("keeps column styles through a round trip", () => {
    const row = setColumnStyle(row2(), 1, baseStyle({ radius: 8 }));
    const back = normalizeBlocks(JSON.parse(JSON.stringify([row])));
    expect(back[0].columnStyles?.[1]?.radius).toBe(8);
  });

  it("reads an old row exactly as before", () => {
    const back = normalizeBlocks([{ type: "row", columns: [[], []] }]);
    expect(back[0].columnStyles).toBeUndefined();
  });

  it("drops a style for a column that no longer exists", () => {
    const back = normalizeBlocks([
      { type: "row", props: { widths: [100] }, columns: [[]], columnStyles: [{ radius: 4 }, { radius: 9 }] },
    ]);
    expect(back[0].columnStyles).toHaveLength(1);
  });
});

describe("a background image chosen from the library", () => {
  const withImage = (image: string) =>
    String(backgroundCss({ ...emptyBackground(), type: "classic", image }, theme).backgroundImage);

  it("becomes a real URL, not a relative path", () => {
    // Stored as "library/1786….webp". Put straight into url() it is relative to
    // whatever page is being viewed, so it 404s and the background silently
    // does not appear — which is exactly what it looks like from the editor.
    const out = withImage("library/1786001442778-photo.webp");
    expect(out).toContain("/storage/v1/object/public/public-media/");
    expect(out).toContain("library/1786001442778-photo.webp");
  });

  it("leaves an image hosted elsewhere alone", () => {
    expect(withImage("https://cdn.test/a.png")).toContain("https://cdn.test/a.png");
  });

  it("still refuses a quote", () => {
    // The value lands inside url('…') and the only safe answer to a quote is
    // that there isn't one.
    // Two quotes exactly — the pair url() itself needs. A third would end the
    // value early and let whatever follows be read as more CSS.
    const out = withImage("https://x.test/a'; background:url(evil)");
    expect((out.match(/'/g) ?? [])).toHaveLength(2);
  });
});

import { describe, it, expect } from "vitest";
import {
  newBlock,
  normalizeBlocks,
  columnAsBlock,
  setColumnStyle,
  setColumnCount,
  splitColumnId,
  baseStyle,
  emptyBackground,
  setStyleAt,
  clearStyleAt,
  type ColumnLayout,
} from "@/lib/blocks";
import { columnCss, backgroundCss, blockRules, rowLayout } from "@/lib/block-style";
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

  it("drops it in the editor too, not only on the way back in", () => {
    // Removing a column left its style in state. Grow back to three and the
    // new empty column arrived wearing the deleted one's corner — and reading
    // the row from the database gave a different answer to the panel that had
    // just built it, which is the pair of facts this asserts together.
    const three = { ...row2(), columns: [[], [], []] };
    const shrunk = setColumnCount(setColumnStyle(three, 2, baseStyle({ radius: 12 })), 2);
    expect(shrunk.columnStyles).toHaveLength(2);
    expect(setColumnCount(shrunk, 3).columnStyles?.[2] ?? null).toBeNull();
    // The same row after a trip through jsonb, grown back the same way: the
    // panel and a refresh have to hand the third column the same style, and
    // they did not — normalizeBlocks trimmed on the way in, setColumnCount
    // did not, so which one you had depended on whether you had reloaded.
    const reloaded = normalizeBlocks(JSON.parse(JSON.stringify([shrunk])))[0];
    expect(setColumnCount(reloaded, 3).columnStyles?.[2] ?? null).toEqual(
      setColumnCount(shrunk, 3).columnStyles?.[2] ?? null,
    );
  });
});

// How a column places itself in its row: its own width, where it sits across
// and down, and what it does with the space left over. All of it optional, and
// all of it per device.

describe("a column nobody has laid out", () => {
  const layoutKeys = (b: ReturnType<typeof row2>) =>
    rowLayout(b, "desktop").columns.map((c) => Object.keys(c).sort());

  it("lays out exactly as it did before any of this existed", () => {
    // The additive guarantee, and the only one worth testing: a row read back
    // from a database written before `col` existed must emit the same three
    // declarations it has always emitted, and nothing beside them.
    const stored = normalizeBlocks([{ type: "row", props: { widths: [60, 40] }, columns: [[], []] }])[0];
    expect(layoutKeys(stored)).toEqual([
      ["minWidth", "order", "width"],
      ["minWidth", "order", "width"],
    ]);
    expect(rowLayout(stored, "desktop").columns[0].width).toBe("calc(60% - 9.6px)");
  });

  it("adds nothing when the column was styled but not laid out", () => {
    // A column given a background is the commonest reason a `columnStyles`
    // entry exists at all. It must not start emitting flex properties.
    const painted = setColumnStyle(row2(), 0, baseStyle({ radius: 12 }));
    expect(layoutKeys(painted)[0]).toEqual(["minWidth", "order", "width"]);
  });
});

describe("what a column can be told about itself", () => {
  const withCol = (patch: Partial<ColumnLayout>, index = 0) =>
    rowLayout(setColumnStyle(row2(), index, baseStyle(patch)), "desktop").columns[index];

  it("takes a width of its own, in the unit it was given", () => {
    expect(withCol({ colWidth: "custom", colWidthValue: 320, colWidthUnit: "px" }).width).toBe("320px");
    expect(withCol({ colWidth: "custom", colWidthValue: 40, colWidthUnit: "vw" }).width).toBe("40vw");
  });

  it("keeps the width the row already stores when Custom has no number", () => {
    // A max-width of nothing collapses a column to nothing. The share the row
    // gave it is the answer that was already there.
    expect(withCol({ colWidth: "custom", colWidthValue: null }).width).toBe("calc(50% - 12px)");
  });

  it("aligns itself against the row", () => {
    expect(withCol({ colAlignSelf: "flex-end" }).alignSelf).toBe("flex-end");
    expect(withCol({ colAlignSelf: "" }).alignSelf).toBeUndefined();
  });

  it("moves to the front or the back without moving in the markup", () => {
    // The row hands out 0 and 1, so -1 and 3 clear both ends without a magic
    // number — and the DOM order stays what a screen reader follows.
    expect(withCol({ colOrder: "start" }, 1).order).toBe(-1);
    expect(withCol({ colOrder: "end" }, 0).order).toBe(3);
    expect(withCol({ colOrder: "custom", colOrderValue: 5 }, 0).order).toBe(5);
  });

  it("grows into the space left over, or gives it up", () => {
    expect(withCol({ colSize: "grow" }).flexGrow).toBe(1);
    expect(withCol({ colSize: "shrink" }).flexShrink).toBe(1);
    expect(withCol({ colSize: "custom", colGrow: 2, colShrink: 0 })).toMatchObject({ flexGrow: 2, flexShrink: 0 });
    expect(withCol({ colSize: "none" }).flexGrow).toBeUndefined();
  });

  it("refuses a value nothing in CSS would accept", () => {
    // Column styles are raw jsonb and normalize is not the last word — this is
    // the boundary where stored text becomes a stylesheet.
    const evil = normalizeBlocks([
      {
        type: "row",
        columns: [[], []],
        columnStyles: [
          { colAlignSelf: "url(evil)", colWidth: "custom", colWidthValue: 1, colWidthUnit: ";}" },
          null,
        ],
      },
    ])[0];
    const css = rowLayout(evil, "desktop").columns[0];
    expect(css.alignSelf).toBeUndefined();
    expect(css.width).toBe("1px");
  });
});

describe("a column laid out for one device only", () => {
  const onMobile = (patch: Partial<ColumnLayout>) => {
    const edited = setStyleAt(columnAsBlock(row2(), 0), "mobile", patch);
    return setColumnStyle(row2(), 0, edited.style, edited.responsive);
  };

  it("says nothing about it at desktop", () => {
    const r = onMobile({ colOrder: "start" });
    expect(rowLayout(r, "desktop").columns[0].order).toBe(0);
    expect(rowLayout(r, "mobile").columns[0].order).toBe(-1);
  });

  it("reaches the live page as a media query, not a style attribute", () => {
    // A style attribute has no media query, and it would outrank the one this
    // emits anyway — so "first on a phone" would silently never happen.
    const css = blockRules(onMobile({ colOrder: "start" }), theme);
    expect(css.split("max-width:767px")[1] ?? "").toContain("order:-1");
    expect(css.split("max-width:767px")[0]).not.toContain("order:-1");
  });

  it("keeps a later desktop edit reaching the narrower widths", () => {
    // The four things a column can be told are four unrelated decisions, so
    // they are four keys. As ONE `col` object, aligning a column on mobile
    // snapshotted its width beside it and every desktop width set afterwards
    // stopped below 768px — with nothing on screen saying so.
    const row = onMobile({ colAlignSelf: "center" });
    const desktop = columnAsBlock(row, 0);
    const wide = setColumnStyle(
      row,
      0,
      { ...desktop.style, colWidth: "custom", colWidthValue: 300 },
      desktop.responsive,
    );
    expect(rowLayout(wide, "desktop").columns[0].width).toBe("300px");
    expect(rowLayout(wide, "mobile").columns[0]).toMatchObject({ width: "300px", alignSelf: "center" });
  });

  it("gives one setting back to the wider width without taking the others", () => {
    // ✕ on a single control. Clearing the whole `col` object took the three
    // decisions beside it that nobody pressed anything about.
    const both = setStyleAt(columnAsBlock(row2(), 0), "mobile", { colAlignSelf: "center", colOrder: "start" });
    const cleared = clearStyleAt(both, "mobile", "colOrder");
    const row = setColumnStyle(row2(), 0, cleared.style, cleared.responsive);
    expect(rowLayout(row, "mobile").columns[0].alignSelf).toBe("center");
    expect(rowLayout(row, "mobile").columns[0].order).toBe(0);
  });

  it("survives a round trip through the database", () => {
    const back = normalizeBlocks(JSON.parse(JSON.stringify([onMobile({ colAlignSelf: "center", colOrder: "end" })])));
    const col = back[0].columnStyles?.[0];
    expect(col?.responsive?.mobile.style).toMatchObject({ colAlignSelf: "center", colOrder: "end" });
    // Sparse, or every column on every page carries a full copy of a style it
    // never changed — and the next desktop edit stops reaching the phone.
    expect(Object.keys(col?.responsive?.mobile.style ?? {}).sort()).toEqual(["colAlignSelf", "colOrder"]);
    expect(Object.keys(col?.responsive?.tablet.style ?? {})).toEqual([]);
  });

  it("stores no overrides at all for a column that has none", () => {
    const back = normalizeBlocks(JSON.parse(JSON.stringify([setColumnStyle(row2(), 0, baseStyle({ radius: 4 }))])));
    expect(back[0].columnStyles?.[0]?.responsive).toBeUndefined();
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

import { describe, it, expect } from "vitest";
import {
  MAX_COLUMNS,
  columnWidths,
  evenWidths,
  newBlock,
  normalizeBlocks,
  setColumnCount,
  setColumnWidth,
  setPropsAt,
  widthsOf,
  type Block,
} from "@/lib/blocks";
import { blockRules, rowLayout } from "@/lib/block-style";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";

const paper = bandTheme("paper");
const row = (props: Record<string, unknown> = {}, cols = 2): Block => {
  const b = newBlock("row");
  return { ...b, props: { ...b.props, ...props }, columns: Array.from({ length: cols }, () => []) };
};
const sum = (ns: number[]) => Math.round(ns.reduce((a, b) => a + b, 0) * 100) / 100;

describe("column widths", () => {
  it("add up to exactly 100, however they divide", () => {
    for (let n = 1; n <= MAX_COLUMNS; n++) expect(sum(evenWidths(n)), `${n}`).toBe(100);
  });

  it("come from the preset a row was built with", () => {
    expect(columnWidths({ structure: "3-2" }, 2)).toEqual([60, 40]);
    expect(columnWidths({ structure: "1-2" }, 2)).toEqual([33.33, 66.67]);
    expect(sum(widthsOf("1-1-1"))).toBe(100);
  });

  it("ignore a preset that describes a different number of columns", () => {
    expect(columnWidths({ structure: "3-2" }, 3)).toEqual(evenWidths(3));
  });

  it("ignore a stored array of the wrong length", () => {
    // A leftover from before someone changed the count; drawing it would give
    // the last column no width at all.
    expect(columnWidths({ widths: [60, 40] }, 3)).toEqual(evenWidths(3));
  });

  it("still add up to 100 after one is resized", () => {
    const out = setColumnWidth([50, 50], 0, 70);
    expect(out).toEqual([70, 30]);
    expect(sum(out)).toBe(100);
  });

  it("take the difference from the others in proportion", () => {
    // 60/20/20 asked for 40 gives 40/30/30, not 40/20/20 with a hole on the end.
    expect(setColumnWidth([60, 20, 20], 0, 40)).toEqual([40, 30, 30]);
  });

  it("refuse a width that would leave nothing for anyone else", () => {
    expect(setColumnWidth([50, 50], 0, 140)[0]).toBe(95);
    expect(setColumnWidth([50, 50], 0, -20)[0]).toBe(5);
    expect(sum(setColumnWidth([50, 50], 0, 140))).toBe(100);
  });

  it("still add up after a resize that does not divide evenly", () => {
    for (const w of [7, 33, 41, 68, 91]) {
      expect(sum(setColumnWidth(evenWidths(3), 1, w)), `${w}`).toBe(100);
    }
  });
});

describe("changing how many columns there are", () => {
  it("adds empty ones", () => {
    const out = setColumnCount(row({}, 2), 4);
    expect(out.columns).toHaveLength(4);
    expect(out.props.widths).toEqual(evenWidths(4));
  });

  it("never deletes what was in the ones it removes", () => {
    const b = row({}, 3);
    b.columns![2] = [newBlock("heading")];
    const out = setColumnCount(b, 2);
    expect(out.columns).toHaveLength(2);
    expect(out.columns![1]).toHaveLength(1);
  });

  it("will not go below one or above the cap", () => {
    expect(setColumnCount(row({}, 2), 0).columns).toHaveLength(1);
    expect(setColumnCount(row({}, 2), 99).columns).toHaveLength(MAX_COLUMNS);
  });

  it("drops per-device widths, which described a row that no longer exists", () => {
    const b = setPropsAt(row({}, 2), "mobile", { widths: [70, 30] });
    expect(setColumnCount(b, 3).responsive).toBeUndefined();
  });

  it("keeps the count when the stored columns disagree with the preset", () => {
    const b = normalizeBlocks([{ type: "row", props: { structure: "1-1" }, columns: [[], [], []] }])[0];
    expect(b.columns).toHaveLength(3);
  });
});

describe("how a row is drawn", () => {
  const widthOf = (css: string) => Number(css.match(/calc\(([\d.]+)%/)?.[1]);

  it("subtracts the gap so a full row comes out at exactly 100%", () => {
    // Two columns of 50% in a 24px gap would overflow by 24px if drawn as
    // written. Each gives up gap × (100−W)/100, and the row lands on 100%.
    const l = rowLayout(row({ widths: [50, 50], gap: 24 }), "desktop");
    expect(l.columns[0].width).toBe("calc(50% - 12px)");
    expect(l.columns[1].width).toBe("calc(50% - 12px)");
  });

  it("takes nothing off a column that is already the whole width", () => {
    const l = rowLayout(row({ widths: [100] }, 1), "desktop");
    expect(l.columns[0].width).toBe("calc(100% - 0px)");
  });

  it("keeps uneven columns adding to a whole row", () => {
    const l = rowLayout(row({ widths: [60, 40], gap: 20 }), "desktop");
    // 60% − 8px and 40% − 12px, plus one 20px gap, is 100%.
    expect(l.columns[0].width).toBe("calc(60% - 8px)");
    expect(l.columns[1].width).toBe("calc(40% - 12px)");
  });

  it("stacks on a phone by default", () => {
    const l = rowLayout(row({ widths: [60, 40] }), "mobile");
    expect(l.columns.map((c) => widthOf(String(c.width)))).toEqual([100, 100]);
  });

  it("does not stack on tablet unless asked", () => {
    expect(rowLayout(row({ widths: [60, 40] }), "tablet").columns[0].width).toContain("60%");
    const also = rowLayout(row({ widths: [60, 40], stack: "tablet" }), "tablet");
    expect(widthOf(String(also.columns[0].width))).toBe(100);
  });

  it("does not stack at all when told not to", () => {
    const l = rowLayout(row({ widths: [60, 40], stack: "none" }), "mobile");
    expect(widthOf(String(l.columns[0].width))).toBe(60);
  });

  it("lets a width set for the phone beat the stacking default", () => {
    // Someone who sets 50/50 on mobile means 50/50 on mobile.
    const b = setPropsAt(row({ widths: [60, 40] }), "mobile", { widths: [50, 50] });
    expect(rowLayout(b, "mobile").columns.map((c) => widthOf(String(c.width)))).toEqual([50, 50]);
  });

  it("reverses by order, leaving the columns where they are in the markup", () => {
    // Reordering the DOM would move the drop targets and the reading order too.
    const plain = rowLayout(row({}), "desktop");
    expect(plain.columns.map((c) => c.order)).toEqual([0, 1]);
    const back = rowLayout(row({ reverse: true }), "desktop");
    expect(back.columns.map((c) => c.order)).toEqual([2, 1]);
  });

  it("reverses on one device only", () => {
    const b = setPropsAt(row({}), "mobile", { reverse: true });
    expect(rowLayout(b, "desktop").columns.map((c) => c.order)).toEqual([0, 1]);
    expect(rowLayout(b, "tablet").columns.map((c) => c.order)).toEqual([0, 1]);
    expect(rowLayout(b, "mobile").columns.map((c) => c.order)).toEqual([2, 1]);
  });
});

describe("the CSS a row emits", () => {
  it("targets its own columns and not a nested row's", () => {
    const css = blockRules(row({}), paper);
    expect(css).toContain("> [data-row] > :nth-child(1)");
    expect(css).not.toContain("[data-row] [data-row]");
  });

  it("writes the phone's stacking as a media query", () => {
    const css = blockRules(row({ widths: [60, 40] }), paper);
    const mobile = css.split("max-width:767px")[1] ?? "";
    expect(mobile).toContain("width:calc(100% - 0px)");
  });

  it("says nothing about tablet when tablet changes nothing", () => {
    const css = blockRules(row({ widths: [60, 40] }), paper);
    expect(css).not.toContain("max-width:1023px");
  });

  it("restates only what the device changes", () => {
    const b = setPropsAt(row({ widths: [60, 40], gap: 24 }), "mobile", { gap: 8 });
    const mobile = blockRules(b, paper).split("max-width:767px")[1] ?? "";
    expect(mobile).toContain("gap:8px");
    expect(mobile).not.toContain("align-items");
  });
});

describe("reverse, from the markup a preview actually renders", () => {
  const render = (b: Block, at?: "desktop" | "tablet" | "mobile") =>
    renderToStaticMarkup(<Blocks blocks={[b]} theme={paper} at={at} />);
  const filled = (props: Record<string, unknown>) => {
    const r = row(props);
    r.columns = [[newBlock("heading", { props: { text: "First" } })], [newBlock("heading", { props: { text: "Second" } })]];
    return r;
  };

  it("puts the second column first, on the page", () => {
    // The preview pane and the canvas both render this component pinned to a
    // device, so if the order is not in the markup it is not anywhere.
    const out = render(filled({ reverse: true }), "desktop");
    expect(out).toMatch(/order:2[^]*order:1/);
  });

  it("leaves the markup order alone — only the painting order changes", () => {
    const out = render(filled({ reverse: true }), "desktop");
    expect(out.indexOf("First")).toBeLessThan(out.indexOf("Second"));
  });

  it("does not reverse a row nobody asked to reverse", () => {
    expect(render(filled({}), "desktop")).toMatch(/order:0[^]*order:1/);
  });

  it("reverses on the phone only, when that is where it was set", () => {
    const b = setPropsAt(filled({}), "mobile", { reverse: true });
    expect(render(b, "desktop")).toMatch(/order:0/);
    expect(render(b, "mobile")).toMatch(/order:2/);
  });

  it("reaches the live page as a rule, not just the preview", () => {
    const css = blockRules(filled({ reverse: true }), paper);
    expect(css).toContain("order:2");
  });
});

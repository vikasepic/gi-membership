import { at, col, make, rowOf, type Template } from "./template";
import type { ColumnStyle } from "@/lib/blocks";

// "Before you write a word, we check if the market is worth it." — a centred
// heading over four points in a two-by-two grid, ruled through the middle.
//
// The cross through the middle is the whole design, and it is not a border
// around anything: it is one line down the middle and one line across. Two
// rows of two columns draw it exactly, now that a border can be one edge —
// before, the only way was four boxes and hoping the doubled hairlines read as
// one.
//
// Stacked on a phone the grid is a list, and a rule down the side of a
// full-width cell is a line down the side of the page. Every rule becomes a
// rule ABOVE its point instead, which is the same design read downwards.

const RULE = "#d5d5d5";

const REAL_PROBLEM = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>',
  title: "Is there a real problem?",
  body: "<em>People need to already feel the pain you solve. Not a nice-to-have.</em>",
};

const CAN_PAY = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="8"></circle><path d="M12 7v10M14.5 9.5a2.5 2.5 0 0 0-5 .5c0 2.5 5 1.5 5 4a2.5 2.5 0 0 1-5 .5"></path></svg>',
  title: "Can they actually pay?",
  body: "<em>A great offer to a broke market never converts.</em>",
};

const GROWING = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 19h16M7 16V9M12 16V5M17 16v-4"></path></svg>',
  title: "Is this market growing?",
  body: "<em>A shrinking market makes every launch harder than it should be.</em>",
};

const REACHABLE = {
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="3.2"></circle><path d="M5 20a7 7 0 0 1 14 0"></path></svg>',
  title: "Can you reach them easily?",
  body: "<em>If the only way to them is luck, the funnel won’t save you.</em>",
};

// Widths said out loud. Left to the row's own arithmetic each column got
// enough basis that the pair wrapped, and a two-by-two became a list.
const GRID_ROW = {
  widths: [50, 50],
  gap: 0,
  wrap: "nowrap",
  verticalAlign: "stretch",
  stack: "mobile",
} as const;

/** The heading, the line under it, and the mark above both. */
function point({ icon, title, body }: { icon: string; title: string; body: string }) {
  return make(
    "cards",
    {
      items: [{ title, body, icon, image: "" }],
      columns: 1,
      skin: "plain",
      media: "icon",
      iconShape: "rounded",
      iconPlace: "above",
      iconBox: 40,
      iconSize: 20,
      iconBg: "#832a63",
      iconColor: "#ffffff",
      cardTextGap: 8,
    },
    { margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false } },
  );
}

/**
 * One cell of the grid.
 *
 * `rule` is the vertical line down the middle, drawn on the LEFT of the
 * right-hand cell; `over` is the horizontal one, drawn on the top of the lower
 * row. Each line has exactly one owner, so the two meet at a single crossing
 * rather than doubling into a 2px cross.
 */
function cell({ rule = false, over = false }: { rule?: boolean; over?: boolean }): ColumnStyle {
  const cellPad = {
    t: over ? 36 : 0,
    r: rule ? 0 : 40,
    b: over ? 0 : 36,
    l: rule ? 40 : 0,
    u: "px" as const,
    link: false,
  };
  const base = col({
    padding: cellPad,
    ...(rule
      ? { borderWidth: 1, borderSides: "left" as const, borderColor: RULE }
      : over
        ? { borderWidth: 1, borderSides: "top" as const, borderColor: RULE }
        : {}),
    // The top-left cell has no rule side by side, and stacked it is the first
    // item — so it stays without one at every width. Every other cell rules
    // ABOVE itself once stacked, whichever edge it used side by side.
    ...(rule || over
      ? {
          responsive: at({
            mobile: {
              style: {
                borderWidth: 1,
                borderSides: "top" as const,
                borderColor: RULE,
                padding: { t: 28, r: 0, b: 0, l: 0, u: "px" as const, link: false },
              },
            },
          }),
        }
      : {}),
  });
  return base;
}

export const template: Template = {
  id: "grid-quadrant",
  name: "Four points, ruled",
  group: "Features",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 900 } },
  blocks: [
    {
      ...make(
        "heading",
        { text: "Before you write a word,\nwe check if the market is worth it.", tag: "h2" },
        {
          color: "#11325b",
          size: 38,
          weight: 700,
          lineHeight: 1.2,
          textAlign: "center",
          blockAlign: "center",
          margin: { t: 0, r: 0, b: 16, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ tablet: { style: { size: 32 } }, mobile: { style: { size: 26 } } }),
    },
    make(
      "text",
      {
        html: [
          "<p>Most coaches skip this. They build the offer first and find out later if anyone wants it. After building funnels that generated millions, we know the opposite is true.</p>",
          "<p>Always validate first.</p>",
        ].join(""),
      },
      {
        color: "#3d3d3d",
        size: 15,
        lineHeight: 1.6,
        textAlign: "center",
        blockAlign: "center",
        width: "custom",
        maxWidthValue: 620,
        maxWidthUnit: "px",
        margin: { t: 0, r: 0, b: 40, l: 0, u: "px", link: false },
      },
    ),
    {
      ...rowOf([[point(REAL_PROBLEM)], [point(CAN_PAY)]], GRID_ROW),
      columnStyles: [cell({}), cell({ rule: true })],
    },
    {
      ...rowOf([[point(GROWING)], [point(REACHABLE)]], GRID_ROW),
      columnStyles: [cell({ over: true }), cell({ rule: true, over: true })],
    },
  ],
};

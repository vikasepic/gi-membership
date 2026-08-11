import { at, col, make, rowOf, type Template } from "./template";
import { baseStyle, dim, type Block, type ColumnStyle } from "@/lib/blocks";

// The counter strip: five figures across a narrow paper band, under a navy
// rule, each separated from the next by a hairline.
//
// Measured from the reference at 2×: the band is 226px tall (113 CSS), the
// navy rule across the top is 20px (10 CSS). The navy is #11325b — the app's
// own, not a near miss.
//
// Not the `stats` block, though that is what it looks like. Its strip layout
// hugs the left and separates at its own weight; this design spreads five
// figures evenly across the full width. Five columns IS that shape, and every
// part of it is a control: the rule is each column's left border, the spread
// is the row's even widths.
//
// The navy rule at the top is a divider block rather than the band's own
// border, because a band has no border — and a 10px navy bar above a paper
// strip belongs to this design, not to whatever section it lands in.
//
// It renders about 142px rather than the reference's 113. The remainder is
// type, not layout: the reference is set in Poppins and this store is not, and
// a face with a taller line box makes a taller strip. Naming a family here
// would close the gap and freeze the strip against a store that later chooses
// its own — so the strip follows the store, as every other block does.

const RULE = "#d8d8d8";
// Measured against the reference: the whole strip is 113 CSS px tall,
// 10 of which is the navy rule. What is left has to hold a 30px figure and
// an 11px label, so the air is 12 a side rather than the 22 a band would
// normally want — this is a rule between sections, not a section.
const PAD = { t: 12, r: 12, b: 12, l: 12, u: "px" as const, link: false };

/** One figure: the number, then what it counts. */
function figure(value: string, label: string): Block[] {
  return [
    make(
      "text",
      { html: `<p>${value}</p>` },
      {
        // A text block, not a heading. A heading takes the site's DISPLAY
        // family — a serif in this store — and the figure in the reference is
        // the body sans at weight 700. Naming a family here instead would
        // freeze the figure against a store that later changes its type.
        width: "auto",
        maxWidthValue: null,
        color: "#11325b",
        size: 30,
        weight: 700,
        lineHeight: 1.1,
        textAlign: "center",
        blockAlign: "center",
        margin: { t: 0, r: 0, b: 4, l: 0, u: "px", link: false },
      },
    ),
    make(
      "text",
      { html: `<p>${label}</p>` },
      {
        // Uppercase and tracked out, so a three-word label reads as a caption
        // under a figure rather than as a sentence beside four others.
        color: "#6b6b6b",
        size: 11,
        weight: 500,
        transform: "uppercase",
        letterSpacing: 1.2,
        lineHeight: 1.3,
        textAlign: "center",
        blockAlign: "center",
        width: "auto",
        maxWidthValue: null,
        margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
      },
    ),
  ];
}

/**
 * A figure's column, with the hairline separating it from the one before.
 *
 * Side by side that hairline is on the left. Stacked on a phone it has to move
 * to the top, or five columns in a row become five vertical lines down the
 * left of a list — the same rule, in the wrong place. Per device, because that
 * is what changes: which edge the rule is on, not whether there is one.
 */
const ruled = (): ColumnStyle =>
  col({
    padding: PAD,
    borderWidth: 1,
    borderSides: "left",
    borderColor: RULE,
    responsive: at({ mobile: { style: { borderSides: "top" } } }),
  });

export const template: Template = {
  id: "proof-counter",
  name: "Counter — five figures",
  group: "Proof",
  band: {
    style: "paper",
    color: "#f6f6f6",
    // Full width, and almost no air: this strip is a rule between two
    // sections, not a section with something in it.
    layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 } },
  },
  blocks: [
    make(
      "divider",
      { thickness: 10, width: 100 },
      { color: "#11325b", margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false } },
    ),
    {
      ...rowOf(
        [
          figure("3×", "Amazon bestseller"),
          figure("100K+", "Books sold direct"),
          figure("$20M", "Business built on books"),
          figure("500K+", "Coaches reached"),
          figure("40yrs", "Proven strategy"),
        ],
        {
          // Said out loud rather than left to the row's arithmetic, which gave
          // each column enough basis to wrap the fifth onto its own line.
          widths: [20, 20, 20, 20, 20],
          gap: 0,
          // Five columns at 20% come to exactly 100%, and the four hairlines
          // between them come to four pixels more — so the fifth figure wrapped
          // onto a line of its own. The row is told not to wrap rather than the
          // widths fudged down to 19%: the columns are equal, and saying so is
          // what keeps them equal when a figure is added or removed.
          wrap: "nowrap",
          verticalAlign: "center",
          // Five figures across a phone is five columns one character wide.
          stack: "mobile",
        },
      ),
      // A block's own 16px bottom margin is right in a stack of blocks and
      // wrong here: inside a 113px strip it is an eighth of the design.
      style: baseStyle({ margin: dim(0, 0, 0, 0) }),
      columnStyles: [
        // No rule on the first: a hairline before the first figure is a rule
        // between the strip and nothing.
        col({ padding: PAD }),
        ruled(),
        ruled(),
        ruled(),
        ruled(),
      ],
    },
  ],
};

import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim, type Block, type ColumnStyle } from "@/lib/blocks";

// Four ways to get the same outcome, with the one you are selling picked out:
// three white cards and one plum, the plum wearing a terracotta "BEST VALUE"
// tab that straddles its top edge.
//
// Not the `pricing` block, which draws a value stack — a list of lines with
// amounts inside one panel. This is four alternatives side by side, and only
// one of them is yours. Four columns IS that, and it is the only shape where
// the chosen one can be a different colour: a cards block paints every card
// the same by definition.
//
// The tab straddling the edge is the z-index control again — pulled up by half
// its height with a negative margin, and lifted over the card's corner so the
// corner does not clip it.

const WHITE_CARD = (): ColumnStyle =>
  col({
    background: fill("#ffffff"),
    radius: 14,
    padding: { t: 26, r: 20, b: 26, l: 20, u: "px", link: false },
  });

const PLUM_CARD = (): ColumnStyle =>
  col({
    background: fill("#832a63"),
    radius: 14,
    padding: { t: 30, r: 20, b: 26, l: 20, u: "px", link: false },
  });

/** The label above the price — plum on white, white on plum. */
const eyebrow = (text: string, color: string, size = 12) =>
  make(
    "text",
    { html: `<p>${text}</p>` },
    {
      color,
      size,
      weight: 700,
      transform: "uppercase",
      letterSpacing: 1.1,
      lineHeight: 1.3,
      textAlign: "center",
      blockAlign: "center",
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 12, l: 0, u: "px", link: false },
    },
  );

const amount = (text: string, color: string, size: number): Block => ({
  ...make(
    "text",
    { html: `<p>${text}</p>` },
    {
      color,
      size,
      weight: 700,
      lineHeight: 1.1,
      textAlign: "center",
      blockAlign: "center",
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 12, l: 0, u: "px", link: false },
    },
  ),
  responsive: at({ tablet: { style: { size: Math.round(size * 0.8) } } }),
});

/** The pale pill under the amount: how long it takes. */
const pill = (text: string, ink: string, ground: string) =>
  make(
    "text",
    { html: `<p>${text}</p>` },
    {
      width: "fit",
      maxWidthValue: null,
      background: fill(ground),
      color: ink,
      size: 13,
      lineHeight: 1.3,
      radius: 999,
      blockAlign: "center",
      textAlign: "center",
      padding: { t: 6, r: 14, b: 6, l: 14, u: "px", link: false },
      margin: { t: 0, r: 0, b: 16, l: 0, u: "px", link: false },
    },
  );

/** The line under the rule that says what you actually get. */
const note = (html: string, color: string, ruleColor: string) =>
  make(
    "text",
    { html },
    {
      color,
      size: 14,
      lineHeight: 1.5,
      textAlign: "center",
      blockAlign: "center",
      width: "auto",
      maxWidthValue: null,
      borderWidth: 1,
      borderSides: "top",
      borderColor: ruleColor,
      padding: { t: 16, r: 0, b: 0, l: 0, u: "px", link: false },
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  );

export const template: Template = {
  id: "pricing-best-value",
  name: "Pricing — four ways, one picked",
  group: "Pricing",
  band: { style: "paper", color: "#f1ecf0", layout: { width: "boxed", maxWidth: 1160 } },
  blocks: [
    // The tab, above the row and pulled down onto the third card. Its own block
    // rather than part of the card, because a card centres what is in it and
    // this has to sit on the card's top EDGE — outside its padding.
    make(
      "text",
      { html: "<p>Best value</p>" },
      {
        width: "fit",
        maxWidthValue: null,
        background: fill("#c8663e"),
        color: "#ffffff",
        size: 12,
        weight: 700,
        transform: "uppercase",
        letterSpacing: 1.1,
        lineHeight: 1,
        radius: 8,
        blockAlign: "center",
        padding: { t: 9, r: 18, b: 9, l: 18, u: "px", link: false },
        // Half its own height, so it straddles the card's top edge, and over
        // the card so the corner does not clip it.
        margin: { t: 0, r: 0, b: -17, l: 0, u: "px", link: false },
        zIndex: 2,
      },
    ),
    {
      ...rowOf(
        [
          [
            eyebrow("Ghostwriter", "#832a63"),
            amount("$10K-$50K", "#1f1f1f", 30),
            pill("6 – 12 months", "#4a1236", "#ead8e4"),
            note(
              "<p>Professional writer. Your story. Significant investment in time and money.</p>",
              "#4a4a4a",
              "#e4e4e4",
            ),
          ],
          [
            eyebrow("Book coach", "#832a63"),
            amount("$500K-$1500K", "#1f1f1f", 30),
            pill("8 – 12 sessions", "#4a1236", "#ead8e4"),
            note(
              "<p>A book coach working one-on-one. Eight to twelve sessions to reach a complete manuscript.</p>",
              "#4a4a4a",
              "#e4e4e4",
            ),
          ],
          [
            eyebrow("Book Writer", "#ffffff", 15),
            amount("$47", "#ffffff", 44),
            pill("Under 2 hours", "#ffffff", "#9c4079"),
            note(
              "<p>Guided AI session. Full manuscript. Your voice. Your copyright. One-time only.</p>",
              "#f6e6f0",
              "#a4548a",
            ),
          ],
          [
            eyebrow("Book writing course", "#832a63"),
            amount("$500 - $2,000", "#1f1f1f", 30),
            pill("Months of solo work", "#4a1236", "#ead8e4"),
            note(
              "<p>A book writing course that requires you to do all the writing yourself.</p>",
              "#4a4a4a",
              "#e4e4e4",
            ),
          ],
        ],
        {
          widths: [25, 25, 25, 25],
          gap: 18,
          verticalAlign: "stretch",
          // Four price cards side by side on a tablet is four columns of one
          // word. Two and two is the readable step down, and the block falls to
          // one on a phone.
          stack: "mobile",
        },
      ),
      style: baseStyle({ margin: dim(0, 0, 0, 0) }),
      columnStyles: [WHITE_CARD(), WHITE_CARD(), PLUM_CARD(), WHITE_CARD()],
    },
  ],
};

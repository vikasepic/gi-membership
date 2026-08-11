import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim, type Block, type ColumnStyle } from "@/lib/blocks";

// Six objections as speech bubbles, alternating: white and inset from the
// left, then lilac and inset from the right, each overlapping the one above.
//
// The hard plum edge along each bubble's bottom is a SHADOW with no blur —
// `0 6px 0` — which is the shape that had no answer before the shadow control
// went in. Drawn as a border it would ring the whole bubble.
//
// The alternation is the row's own doing: each bubble is a one-column row whose
// column takes 78% of the width and sits left or right. A cards block cannot do
// this — it paints every card the same by definition, and here every other card
// is a different colour on a different side.
//
// The overlap is a negative top margin on every bubble but the first, which is
// what makes them read as a conversation stacking up rather than as six boxes.

const INK = "#1f1f1f";
const EDGE = "#832a63";

/** One bubble: its quote in bold, then the line under it. */
const bubble = (quote: string, body: string): Block[] => [
  make(
    "text",
    { html: `<p><strong>“${quote}”</strong></p>` },
    {
      color: INK,
      blockAlign: "left",
      size: 17,
      weight: 700,
      lineHeight: 1.4,
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 6, l: 0, u: "px", link: false },
    },
  ),
  make(
    "text",
    { html: `<p>${body}</p>` },
    {
      color: "#3d3d3d",
      blockAlign: "left",
      size: 16,
      lineHeight: 1.5,
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  ),
];

/** A bubble's column: the fill, the corner, and the hard plum edge under it. */
const skin = (background: string): ColumnStyle =>
  col({
    background: fill(background),
    radius: 14,
    // Blur zero: a hard second edge peeking out below, not a soft lift.
    shadowY: 6,
    shadowBlur: 0,
    shadowColor: EDGE,
    padding: { t: 22, r: 28, b: 22, l: 28, u: "px", link: false },
  });

/**
 * One bubble in the stack.
 *
 * TWO columns, one of them empty. A row with a single column normalizes that
 * column to 100% — it has to, or a row would be able to store a width its own
 * arithmetic contradicts — so a 78% bubble beside 22% of nothing is the only
 * honest way to inset it. Which side the empty column sits on is what
 * alternates the bubbles left and right.
 *
 * `first` keeps its top margin; every other bubble pulls up over the one above.
 * That overlap is what makes six boxes read as one conversation.
 */
const speech = (
  quote: string,
  body: string,
  { right = false, first = false }: { right?: boolean; first?: boolean } = {},
): Block => ({
  ...rowOf(right ? [[], bubble(quote, body)] : [bubble(quote, body), []], {
    widths: right ? [22, 78] : [78, 22],
    gap: 0,
    verticalAlign: "stretch",
    // Never stacked: the empty column has nothing to stack, and the bubble
    // simply runs wider on a phone, which is what a phone wants anyway.
    stack: "none",
  }),
  style: baseStyle({ margin: dim(first ? 0 : -14, 0, 0, 0) }),
  columnStyles: right ? [col(), skin("#dfc5d6")] : [skin("#ffffff"), col()],
});

export const template: Template = {
  id: "chat-quotes",
  name: "Objections — chat bubbles",
  group: "Objections",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 900 } },
  blocks: [
    speech(
      "I know what I do, but I struggle to explain it clearly.",
      "You’ve got the expertise, but when you try to articulate your offer, prospects get confused instead of excited.",
      { first: true },
    ),
    speech(
      "I’m showing up everywhere, but nothing’s really converting.",
      "You post, run ads, send emails. You’re doing all the things. But the results just aren’t there yet.",
      { right: true },
    ),
    speech(
      "Every sale takes way too long.",
      "Too many calls. Too many follow-ups. Too much convincing. It feels exhausting, not exciting.",
    ),
    speech(
      "I know I’m undercharging.",
      "You’re delivering incredible value, but asking for what you’re worth feels uncomfortable. So you don’t.",
      { right: true },
    ),
    speech(
      "I can’t seem to scale myself.",
      "Revenue only happens when you’re in the room. Everything depends on you showing up and explaining it. Again.",
    ),
    speech(
      "I’m working harder, but not growing.",
      "Not because your offer isn’t strong. But because you don’t have the structure to turn effort into momentum.",
      { right: true },
    ),
    {
      ...make(
        "text",
        { html: "<p>Sound familiar?</p>" },
        {
          color: INK,
          size: 20,
          weight: 700,
          textAlign: "center",
          blockAlign: "center",
          width: "auto",
          maxWidthValue: null,
          margin: { t: 28, r: 0, b: 0, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ mobile: { style: { size: 17 } } }),
    },
  ],
};

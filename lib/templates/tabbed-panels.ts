import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim, type Block } from "@/lib/blocks";

// Numbered sections, each an outlined white card with a plum tab straddling its
// top edge.
//
// The tab is the same trick the Best Value price card uses: a fitted text block
// pulled down by half its own height with a negative bottom margin, and given a
// z-index so it paints OVER the card's outline rather than under it. Here it
// sits to the left rather than centred, which is the whole difference.
//
// It has to be its own block above the card, not the first block inside it: a
// column with a corner clips what overflows it, so a tab drawn from within
// would be cut in half by the very corner that makes it a card.

const TAB = "#7a2a5c";

const tab = (text: string) =>
  make(
    "text",
    { html: `<p>${text}</p>` },
    {
      width: "fit",
      maxWidthValue: null,
      // Left, and said out loud — a fitted text block inherits centre and
      // would float the tab to the middle of the card.
      blockAlign: "left",
      background: fill(TAB),
      color: "#ffffff",
      size: 19,
      weight: 700,
      lineHeight: 1.2,
      radius: 10,
      padding: { t: 12, r: 22, b: 12, l: 22, u: "px", link: false },
      // Half its height, so it straddles the outline it sits on.
      margin: { t: 0, r: 0, b: -22, l: 26, u: "px", link: false },
      zIndex: 2,
    },
  );

/** The tab, with its type stepped down on a phone. */
const tabBlock = (text: string): Block => ({
  ...tab(text),
  responsive: at({ mobile: { style: { size: 16 } } }),
});

const lead = (text: string) =>
  make(
    "text",
    { html: `<p>${text}</p>` },
    {
      color: "#2f2f2f",
      blockAlign: "left",
      size: 16,
      lineHeight: 1.55,
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false },
    },
  );

const checks = (lines: string[]) =>
  make(
    "iconlist",
    {
      items: lines.map((text) => ({ text })),
      layout: "stacked",
      iconSize: 17,
      gap: 16,
      iconColor: "#832a63",
    },
    {
      color: "#2f2f2f",
      size: 16,
      lineHeight: 1.55,
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  );

const panel = (title: string, leadIn: string, lines: string[], last = false): Block[] => [
  tabBlock(title),
  {
    ...rowOf([[lead(leadIn), checks(lines)]], { gap: 0 }),
    style: baseStyle({ margin: dim(0, 0, last ? 0 : 26, 0) }),
    columnStyles: [
      col({
        background: fill("#ffffff"),
        radius: 16,
        borderWidth: 1,
        borderColor: "#9c4a7e",
        padding: { t: 40, r: 34, b: 32, l: 34, u: "px", link: false },
        responsive: at({
          mobile: { style: { padding: { t: 34, r: 20, b: 24, l: 20, u: "px", link: false } } },
        }),
      }),
    ],
  },
];

export const template: Template = {
  id: "tabbed-panels",
  name: "Tabbed panels — numbered",
  group: "Curriculum",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 940 } },
  blocks: [
    ...panel(
      "1. Templates for every core business move",
      "So you can stop guessing and start plugging in.",
      [
        "Webinar flow templates that show you what to say, in what order.",
        "Conversation outlines for enrollment calls that feel natural and honest.",
        "Proposal templates you can adapt for larger deal sizes.",
        "Offer document structures, so you can present your products clearly and confidently.",
        "A sales page template for online and group programmes.",
      ],
    ),
    ...panel(
      "2. Social media and campaign structures",
      "So your marketing stops being random.",
      [
        "Campaign structures for social media, so you know how to plan a simple but effective push.",
        "Post templates for the platforms you actually post on, that fit a service-based, expert brand.",
        "Newsletter models that show you how to open, teach and make an offer without it feeling awkward.",
      ],
      true,
    ),
  ],
};

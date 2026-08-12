import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim, type Block, type ColumnStyle } from "@/lib/blocks";

// "Get ready to discover…" — six outlined white cards in two columns, each
// with a round lilac mark beside one paragraph, then a closing line and the
// button.
//
// Rows of two columns rather than one cards block, because the hard plum edge
// belongs to EACH card and a block's shadow is one shadow around the whole
// block. The card is the column, which is where a shadow and a border already
// live.
//
// No titles on purpose: every card in the reference is a single sentence. A
// card block would want a heading per card and leaving it blank shows an empty
// h3, so the copy is a text block beside its own mark.

const CARD = (): ColumnStyle =>
  col({
    background: fill("#ffffff"),
    radius: 12,
    borderWidth: 1,
    borderColor: "#a9628e",
    // The hard edge, offset down and right, exactly as the reference draws it.
    shadowX: 2,
    shadowY: 4,
    shadowBlur: 0,
    shadowColor: "#7a2a5c",
    padding: { t: 20, r: 22, b: 20, l: 20, u: "px", link: false },
  });

const MARKS = {
  audience:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="9" cy="9" r="3"></circle><path d="M3.5 19a5.5 5.5 0 0 1 11 0"></path><circle cx="17" cy="7.5" r="2.2"></circle><path d="M15 14.5a4.5 4.5 0 0 1 6 4.5"></path></svg>',
  question:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="4" y="3.5" width="16" height="17" rx="2"></rect><path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.4V14"></path><path d="M12.5 17h.01"></path></svg>',
  ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="5"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"></path></svg>',
  steps:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="7" cy="7" r="2.6"></circle><circle cx="7" cy="17" r="2.6"></circle><circle cx="17" cy="12" r="2.6"></circle><path d="M9.6 7H13M9.6 17H13M14.6 12H13"></path></svg>',
  authority:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 10h16M12 3l8 4H4Z"></path><path d="M7 10v7M12 10v7M17 10v7M4 20h16"></path></svg>',
  tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"></path><path d="M14 4v5h5"></path><circle cx="11" cy="14" r="2.4"></circle><path d="m13 16 2 2"></path></svg>',
};

/** One card: the mark, then one sentence beside it. */
const point = (icon: string, body: string) =>
  make(
    "cards",
    {
      items: [{ title: "", body, icon, image: "" }],
      columns: 1,
      skin: "plain",
      media: "icon",
      iconShape: "circle",
      iconPlace: "beside",
      iconBox: 44,
      iconSize: 22,
      iconBg: "#ead8e4",
      iconColor: "#832a63",
    },
    {
      color: "#2f2f2f",
      size: 15,
      lineHeight: 1.5,
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  );

const pair = (left: Block, right: Block, last = false): Block => ({
  ...rowOf([[left], [right]], {
    widths: [50, 50],
    gap: 20,
    verticalAlign: "stretch",
    stack: "mobile",
  }),
  style: baseStyle({ margin: dim(0, 0, last ? 0 : 20, 0) }),
  columnStyles: [CARD(), CARD()],
});

export const template: Template = {
  id: "discover-grid",
  name: "What you get — outlined pairs",
  group: "Features",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 1040 } },
  blocks: [
    {
      ...make(
        "heading",
        { text: "Get ready to discover…", tag: "h2" },
        {
          color: "#11325b",
          size: 30,
          weight: 700,
          lineHeight: 1.25,
          textAlign: "center",
          blockAlign: "center",
          margin: { t: 0, r: 0, b: 26, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ mobile: { style: { size: 24 } } }),
    },
    pair(
      point(
        MARKS.audience,
        "The positioning approach that makes you magnetic to the right clients so they stop scrolling and start paying attention, without you changing who you are",
      ),
      point(
        MARKS.question,
        "The repeatable clarity system that ends “what should I post?” forever so you always know exactly what to create and why it converts",
      ),
    ),
    pair(
      point(
        MARKS.ai,
        "How to use AI as a content multiplier that cuts your creation time in half while keeping every word sounding unmistakably like you",
      ),
      point(
        MARKS.steps,
        "The exact three-post sequence that moves someone from stranger to booked client so you have a straight line from content to cash",
      ),
    ),
    pair(
      point(
        MARKS.authority,
        "The authority-building approach that makes your content work harder over time so your audience trusts you before they ever get on a call with you",
      ),
      point(
        MARKS.tool,
        "A complete tool that uses this strategy to build your content and build your online authority.",
      ),
      true,
    ),
    make(
      "text",
      {
        html: "<p>This free 30-minute masterclass will become your complete roadmap to showing up online with confidence and turning that visibility into a steady stream of high-paying clients.</p>",
      },
      {
        color: "#3d3d3d",
        size: 15,
        lineHeight: 1.6,
        textAlign: "center",
        blockAlign: "center",
        width: "custom",
        maxWidthValue: 660,
        maxWidthUnit: "px",
        margin: { t: 30, r: 0, b: 20, l: 0, u: "px", link: false },
      },
    ),
    make(
      "button",
      { text: "Reserve My Free Seat Now", link: "#", variant: "solid", action: "link" },
      {
        background: fill("#c8663e"),
        color: "#ffffff",
        radius: 999,
        blockAlign: "center",
        margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
      },
    ),
  ],
};

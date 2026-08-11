import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim } from "@/lib/blocks";

// "What you will build over 3 days" — three white cards, each with a plum
// badge, a heading and a checklist, each sitting on a heavier plum edge along
// its bottom.
//
// That bottom edge is the design's signature and it is a border on ONE side,
// which is why this template waited for the edge control. Drawn as a box it
// would outline all four sides of a white card on a paper band, which is a
// different design entirely.
//
// Each day is a one-column row: the card holds three blocks — badge, heading,
// checks — and the container that holds several blocks is the column.

const CARD = (over = {}) =>
  col({
    background: fill("#ffffff"),
    radius: 14,
    borderWidth: 3,
    borderSides: "bottom",
    borderColor: "#832a63",
    padding: { t: 26, r: 30, b: 26, l: 30, u: "px", link: false },
    ...over,
  });

/** The DAY N pill: small, uppercase, plum, sitting on its own line. */
const badge = (label: string) =>
  make(
    "text",
    { html: `<p>${label}</p>` },
    {
      width: "fit",
      maxWidthValue: null,
      // A fitted box plus a text block's inherited centre is a badge that
      // floats to the middle of the card. The badge belongs on the left.
      blockAlign: "left",
      background: fill("#832a63"),
      color: "#ffffff",
      size: 11,
      weight: 700,
      transform: "uppercase",
      letterSpacing: 1,
      lineHeight: 1,
      radius: 6,
      padding: { t: 7, r: 12, b: 7, l: 12, u: "px", link: false },
      margin: { t: 0, r: 0, b: 14, l: 0, u: "px", link: false },
    },
  );

const dayTitle = (text: string) =>
  make(
    "heading",
    { text, tag: "h3" },
    {
      color: "#1f1f1f",
      size: 20,
      weight: 700,
      lineHeight: 1.3,
      margin: { t: 0, r: 0, b: 14, l: 0, u: "px", link: false },
    },
  );

/** The checks. `iconlist` already draws the tick and the spacing. */
const checks = (lines: string[]) =>
  make(
    "iconlist",
    {
      items: lines.map((text) => ({ text })),
      layout: "stacked",
      iconSize: 15,
      gap: 12,
      iconColor: "#832a63",
    },
    {
      color: "#3d3d3d",
      size: 15,
      lineHeight: 1.5,
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  );

const day = (label: string, title: string, lines: string[]) => ({
  ...rowOf([[badge(label), dayTitle(title), checks(lines)]], { gap: 0 }),
  style: baseStyle({ margin: dim(0, 0, 20, 0) }),
  columnStyles: [CARD()],
});

export const template: Template = {
  id: "curriculum-days",
  name: "Curriculum — three days",
  group: "Curriculum",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 780 } },
  blocks: [
    {
      ...make(
        "heading",
        { text: "What you will build over 3 days", tag: "h2" },
        {
          color: "#11325b",
          size: 32,
          weight: 700,
          lineHeight: 1.25,
          textAlign: "center",
          blockAlign: "center",
          margin: { t: 0, r: 0, b: 12, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ mobile: { style: { size: 25 } } }),
    },
    make(
      "text",
      {
        html: "<p>Three short sessions. Each one builds on the last. By Day 3 you have a working AI system running inside your business.</p>",
      },
      {
        color: "#3d3d3d",
        size: 15,
        lineHeight: 1.6,
        width: "auto",
        maxWidthValue: null,
        margin: { t: 0, r: 0, b: 28, l: 0, u: "px", link: false },
      },
    ),
    day("Day 1", "Stop treating AI like a search engine", [
      "Learn the one shift that changes every AI interaction you will ever have",
      "Use reverse prompting to get near-perfect output on the first pass",
      "Brief AI the way you would brief a talented team member",
    ]),
    day("Day 2", "Build your AI Brain", [
      "One document under 1,000 words that teaches any AI who you are",
      "If you have emails, sessions, or recordings, we use those. If you do not, Claude interviews you and builds it from scratch.",
      "Works across every AI tool, every conversation, from this point on",
    ]),
    day("Day 3", "Build your first AI skill", [
      "Train AI on the best examples in your field, not just what you can describe",
      "Build a specialist that produces great output in your voice every time",
      "Remove the skill ceiling that has been limiting your business",
    ]),
  ],
};

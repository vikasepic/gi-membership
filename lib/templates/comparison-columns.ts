import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim, type Block, type ColumnStyle } from "@/lib/blocks";

// Three ways in, side by side: a picture, a navy label bar, three labelled
// points, then the investment and its button.
//
// Each column is a card, and the card is the column — background, corner and a
// soft shadow, which is what the shadow control was added for. The label bar
// is a full-bleed navy strip across the card's width, so the card cannot clip
// its own corners: the column has no radius, and the strip and the picture
// each carry the corner on the side they meet.
//
// The three points inside each card are a cards block at one column, icon
// beside, plain skin. A row inside a column would be a container inside a
// container, which this tree does not do — and does not need to, because that
// shape belongs to the block.

const CARD = (): ColumnStyle =>
  col({
    background: fill("#ffffff"),
    radius: 14,
    shadowY: 6,
    shadowBlur: 22,
    shadowColor: "#00000014",
    padding: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
  });

const shot = (url: string, alt: string) =>
  make(
    "image",
    { url, alt, ratio: "16/9", maxWidth: 100 },
    {
      width: "auto",
      maxWidthValue: null,
      // The picture meets the card's top corners, so it takes them itself.
      radius: 14,
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  );

const bar = (text: string) =>
  make(
    "text",
    { html: `<p>${text}</p>` },
    {
      background: fill("#1c3f6e"),
      color: "#ffffff",
      // Said out loud. A text block starts centred, and `margin: 0 auto` on a
      // child of the canvas's flex column shrinks it to its own content — so a
      // bar meant to run the card's full width silently becomes a pill.
      blockAlign: "left",
      size: 17,
      weight: 600,
      lineHeight: 1.3,
      textAlign: "center",
      width: "auto",
      maxWidthValue: null,
      padding: { t: 12, r: 16, b: 12, l: 16, u: "px", link: false },
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  );

const HEX =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3.2 19.5 7.6v8.8L12 20.8 4.5 16.4V7.6Z"></path><circle cx="12" cy="10.4" r="2.1"></circle><path d="M8.4 16.2a3.8 3.8 0 0 1 7.2 0"></path></svg>';

const points = (items: { title: string; body: string }[]) =>
  make(
    "cards",
    {
      items: items.map((it) => ({
        title: "",
        body: `<strong>${it.title}</strong> ${it.body}`,
        icon: HEX,
        image: "",
      })),
      columns: 1,
      skin: "plain",
      media: "icon",
      iconShape: "circle",
      iconPlace: "beside",
      iconBox: 30,
      iconSize: 18,
      iconBg: "#ead8e4",
      iconColor: "#832a63",
      divider: true,
      cardGap: 18,
    },
    {
      color: "#3d3d3d",
      size: 14,
      lineHeight: 1.55,
      padding: { t: 22, r: 22, b: 4, l: 22, u: "px", link: false },
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  );

const price = (label: string, figure: string, cta: string): Block[] => [
  make(
    "text",
    { html: `<p>${label}</p>` },
    {
      color: "#4a4a4a",
      size: 15,
      lineHeight: 1.3,
      textAlign: "center",
      blockAlign: "center",
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 6, l: 0, u: "px", link: false },
    },
  ),
  make(
    "text",
    { html: `<p>${figure}</p>` },
    {
      color: "#832a63",
      size: 34,
      weight: 700,
      lineHeight: 1.1,
      textAlign: "center",
      blockAlign: "center",
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 16, l: 0, u: "px", link: false },
    },
  ),
  make(
    "button",
    { text: cta, link: "#", variant: "solid", action: "link" },
    {
      background: fill("#c8663e"),
      color: "#ffffff",
      blockAlign: "center",
      radius: 999,
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  ),
];

/** The pale tray at the foot of each card, holding the price and the button. */
const foot = () =>
  baseStyle({
    background: fill("#f4f4f4"),
    padding: dim(20, 20, 24, 20),
    margin: dim(0, 0, 0, 0),
  });

const way = (
  image: string,
  alt: string,
  label: string,
  items: { title: string; body: string }[],
  investment: [string, string, string],
): Block[] => [
  shot(image, alt),
  bar(label),
  points(items),
  {
    ...rowOf([price(...investment)], { gap: 0 }),
    style: foot(),
    columnStyles: [col()],
  },
];

export const template: Template = {
  id: "comparison-columns",
  name: "Three ways in — compared",
  group: "Pricing",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 1120 } },
  blocks: [
    {
      ...make(
        "heading",
        { text: "The only difference is how you want to get there.", tag: "h2" },
        {
          color: "#11325b",
          size: 26,
          weight: 700,
          lineHeight: 1.3,
          textAlign: "center",
          blockAlign: "center",
          margin: { t: 0, r: 0, b: 28, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ mobile: { style: { size: 21 } } }),
    },
    {
      ...rowOf(
        [
          way(
            "/templates/sections/way-scale.svg",
            "Scale to a Million",
            "Learn at your own pace",
            [
              { title: "Best for:", body: "Solopreneurs and founders under $50K who need a roadmap." },
              {
                title: "You'll get:",
                body: "8 hours of training, market selection, pricing frameworks, ARM marketing system, custom AI tools and Templates, and recorded Q&amp;A calls.",
              },
              { title: "Why choose this:", body: "Affordable, flexible, and a great place to get started." },
            ],
            ["Investment:", "$499", "Get on the waitlist"],
          ),
          way(
            "/templates/sections/way-inside.svg",
            "Greater Inside",
            "12 Month Live Container",
            [
              { title: "Best for:", body: "Founders building toward $250K who want structure, coaching, and community." },
              {
                title: "You'll get:",
                body: "Weekly training and coaching, weekly peer accountability, 2 live immersions, and pre-built AI tools.",
              },
              {
                title: "Why choose this:",
                body: "A complete system with ongoing support from Ajit and team, and a founder community.",
              },
            ],
            ["Investment:", "$3000", "Get on the waitlist"],
          ),
          way(
            "/templates/sections/way-partners.svg",
            "Success Partners",
            "Private Group Coaching",
            [
              { title: "Best for:", body: "Founders at $250K-$10M ready to double income or add $200K+ profit." },
              {
                title: "You'll get:",
                body: "Bi-weekly group coaching, monthly 1-on-1 planning, custom AI systems.",
              },
              { title: "Why choose this:", body: "Intensive support for aggressive growth." },
            ],
            ["Investment:", "$30,000", "Invite Only"],
          ),
        ],
        { widths: [33.33, 33.33, 33.34], gap: 22, verticalAlign: "stretch", stack: "tablet" },
      ),
      style: baseStyle({ margin: dim(0, 0, 0, 0) }),
      columnStyles: [CARD(), CARD(), CARD()],
    },
  ],
};

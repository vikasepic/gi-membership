import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim, type Block } from "@/lib/blocks";

// The navy hero: the promise on the left, three facts about the offer stacked
// on the right in panels a shade lighter than the band.
//
// The band is the Navy preset, so the pale ink comes with it — nothing here
// names a text colour for the left-hand copy, and switching the band later
// keeps it readable. The fact panels take an explicit #102e54 because they are
// a measured shade DARKER than the preset's own panel, which is what makes
// them read as inset rather than raised.
//
// The right column is three separate rows rather than one cards block: the
// first fact runs the full width and the next two sit side by side, and a cards
// block paints one grid.

const NAVY_PANEL = "#102e54";

const fact = (label: string, value: string, note: string): Block[] => [
  make(
    "text",
    { html: `<p>${label}</p>` },
    {
      color: "#c8663e",
      blockAlign: "left",
      size: 12,
      weight: 600,
      transform: "uppercase",
      letterSpacing: 1.2,
      lineHeight: 1.3,
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 8, l: 0, u: "px", link: false },
    },
  ),
  make(
    "text",
    { html: `<p>${value}</p>` },
    {
      color: "#ffffff",
      blockAlign: "left",
      size: 24,
      weight: 700,
      lineHeight: 1.2,
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 8, l: 0, u: "px", link: false },
    },
  ),
  make(
    "text",
    { html: `<p>${note}</p>` },
    {
      color: "#b9c8de",
      blockAlign: "left",
      size: 13,
      lineHeight: 1.5,
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  ),
];

const PANEL = () =>
  col({
    background: fill(NAVY_PANEL),
    radius: 12,
    padding: { t: 20, r: 22, b: 20, l: 22, u: "px", link: false },
  });

export const template: Template = {
  id: "banner-navy-facts",
  name: "Hero — navy, with facts",
  group: "Hero",
  band: {
    style: "navy",
    layout: { width: "boxed", maxWidth: 1160, pad: { t: 72, r: null, b: 72, l: null } },
  },
  blocks: [
    {
      ...rowOf(
        [
          [
            make(
              "text",
              {
                html: "<p><em>For the coach, consultant, or online course creator who has been saying “I’ll write my book someday” for longer than they’d like to admit…</em></p>",
              },
              {
                color: "#c6d3e6",
                blockAlign: "left",
                size: 15,
                lineHeight: 1.55,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false },
              },
            ),
            {
              ...make(
                "heading",
                {
                  text: 'Go From "I Should Write a Book" to "Here\'s My Book" In Under Two Hours.',
                  tag: "h1",
                },
                {
                  color: "#ffffff",
                  size: 42,
                  weight: 700,
                  lineHeight: 1.15,
                  margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false },
                },
              ),
              responsive: at({
                tablet: { style: { size: 34 } },
                mobile: { style: { size: 28 } },
              }),
            },
            make(
              "text",
              {
                html: [
                  "<p>A guided AI conversation that pulls your ideas, your frameworks, and your voice out of your head and turns them into a complete, publishable book.</p>",
                  "<p><em>Built by a three-time Amazon bestselling author, Ajit Nawalkha, for the people who have been saying “someday” for too long.</em></p>",
                ].join(""),
              },
              {
                color: "#c6d3e6",
                blockAlign: "left",
                size: 15,
                lineHeight: 1.65,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 26, l: 0, u: "px", link: false },
              },
            ),
            make(
              "button",
              { text: "Write My Book Today", link: "#", variant: "solid", action: "link" },
              {
                background: fill("#c8663e"),
                color: "#ffffff",
                radius: 999,
                blockAlign: "left",
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
          [
            {
              ...rowOf([fact("Manuscript length", "20,000 – 60,000 Words", "Written in your voice. Structured from start to finish. Ready to publish.")], { gap: 0 }),
              style: baseStyle({ margin: dim(0, 0, 14, 0) }),
              columnStyles: [PANEL()],
            },
            {
              ...rowOf(
                [
                  fact("Time required", "~2 hrs", "Not months. Not years. One session."),
                  fact("Investment", "$47", "One-time. No subscription. No catch."),
                ],
                { widths: [50, 50], gap: 14, verticalAlign: "stretch", stack: "mobile" },
              ),
              style: baseStyle({ margin: dim(0, 0, 14, 0) }),
              columnStyles: [PANEL(), PANEL()],
            },
            {
              ...rowOf([fact("Copyright ownership", "100% Yours", "Full rights. No exceptions. Publish anywhere, any way you want.")], { gap: 0 }),
              style: baseStyle({ margin: dim(0, 0, 0, 0) }),
              columnStyles: [PANEL()],
            },
          ],
        ],
        { widths: [48, 52], gap: 44, verticalAlign: "center", stack: "tablet" },
      ),
      style: baseStyle({ margin: dim(0, 0, 0, 0) }),
      columnStyles: [col(), col()],
    },
  ],
};

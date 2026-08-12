import { at, col, make, rowOf, type Template } from "./template";
import { baseStyle, dim, type Block, type ColumnStyle } from "@/lib/blocks";

// Four case studies in a ruled two-by-two: a round portrait with the name and
// a plum role beside it, one italic reference line, a pull quote against a
// plum bar, then the story in a paragraph or two.
//
// The rules are the one-edge border again — down the middle, across between
// the rows — and stacked on a phone every one becomes a rule ABOVE its case,
// the same way the quadrant grid does.
//
// The pull quote's plum bar is a left border on a text block, which is what
// that control was for: a rule beside something, not a box around it.
//
// Names and stories are DUMMY and read as dummy. The reference names four real
// public figures and makes specific claims about their revenue; a template
// that shipped those would be putting words in real people's mouths on a live
// sales page. Replace them with your own, with permission.

const RULE = "#d8d8d8";

const person = (avatar: string, name: string, role: string) =>
  make(
    "cards",
    {
      items: [{ title: name, body: role, icon: "", image: avatar }],
      columns: 1,
      skin: "plain",
      media: "image",
      iconShape: "circle",
      iconPlace: "beside",
      iconBox: 44,
      cardTextGap: 2,
    },
    {
      color: "#1f1f1f",
      size: 16,
      margin: { t: 0, r: 0, b: 14, l: 0, u: "px", link: false },
    },
  );

const reference = (text: string) =>
  make(
    "text",
    { html: `<p><em>${text}</em></p>` },
    {
      color: "#4a4a4a",
      blockAlign: "left",
      size: 14,
      lineHeight: 1.5,
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 14, l: 0, u: "px", link: false },
    },
  );

/** The pulled line, against the plum bar. A rule beside it, not a box round it. */
const pull = (text: string) =>
  make(
    "text",
    { html: `<p><em>${text}</em></p>` },
    {
      color: "#1f1f1f",
      blockAlign: "left",
      size: 15,
      lineHeight: 1.5,
      width: "auto",
      maxWidthValue: null,
      borderWidth: 3,
      borderSides: "left",
      borderColor: "#832a63",
      padding: { t: 0, r: 0, b: 0, l: 14, u: "px", link: false },
      margin: { t: 0, r: 0, b: 14, l: 0, u: "px", link: false },
    },
  );

const story = (paragraphs: string[]) =>
  make(
    "text",
    { html: paragraphs.map((t) => `<p>${t}</p>`).join("") },
    {
      color: "#3d3d3d",
      blockAlign: "left",
      size: 15,
      lineHeight: 1.6,
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  );

const cellFor = ({ ruled = false, over = false }): ColumnStyle =>
  col({
    padding: {
      t: over ? 30 : 0,
      r: ruled ? 0 : 34,
      b: over ? 0 : 30,
      l: ruled ? 34 : 0,
      u: "px",
      link: false,
    },
    ...(ruled
      ? { borderWidth: 1, borderSides: "left" as const, borderColor: RULE }
      : over
        ? { borderWidth: 1, borderSides: "top" as const, borderColor: RULE }
        : {}),
    ...(ruled || over
      ? {
          responsive: at({
            mobile: {
              style: {
                borderWidth: 1,
                borderSides: "top" as const,
                borderColor: RULE,
                padding: { t: 26, r: 0, b: 0, l: 0, u: "px" as const, link: false },
              },
            },
          }),
        }
      : {}),
  });

const study = (
  avatar: string,
  name: string,
  role: string,
  ref: string,
  quote: string,
  paragraphs: string[],
): Block[] => [person(avatar, name, role), reference(ref), pull(quote), story(paragraphs)];

const CASE_ROW = {
  widths: [50, 50],
  gap: 0,
  wrap: "nowrap",
  verticalAlign: "stretch",
  stack: "mobile",
} as const;

export const template: Template = {
  id: "testimonial-cases",
  name: "Testimonials — ruled case studies",
  group: "Testimonials",
  band: { style: "paper", color: "#ffffff", layout: { width: "boxed", maxWidth: 1080 } },
  blocks: [
    {
      ...rowOf(
        [
          study(
            "/templates/sections/portrait-1.svg",
            "Firstname Lastname",
            "What they do",
            "Key reference: The thing they made (year)",
            "The one line worth pulling out of the story below.",
            [
              "Two or three sentences of what they did and what changed. Concrete, in order, and no longer than this box.",
            ],
          ),
          study(
            "/templates/sections/portrait-2.svg",
            "Firstname Lastname",
            "What they do",
            "Key reference: The thing they made (year)",
            "A second pulled line, shorter than the first.",
            [
              "The background, then the turn, then where it left them. Two paragraphs is the most this shape holds before it starts to look like an essay.",
              "The second paragraph is where the number goes, if there is one you can stand behind.",
            ],
          ),
        ],
        CASE_ROW,
      ),
      style: baseStyle({ margin: dim(0, 0, 0, 0) }),
      columnStyles: [cellFor({}), cellFor({ ruled: true })],
    },
    {
      ...rowOf(
        [
          study(
            "/templates/sections/portrait-3.svg",
            "Firstname Lastname",
            "What they do",
            "Key reference: The thing they made (year)",
            "The idea existed for years. This is what made it real.",
            [
              "Keep the four stories roughly the same length. One that runs twice as long as its neighbour makes the grid look broken rather than full.",
            ],
          ),
          study(
            "/templates/sections/portrait-1.svg",
            "Firstname Lastname",
            "What they do",
            "Key reference: The thing they made (year)",
            "A closing line that answers the objection the page is really about.",
            [
              "The last of the four does the most work: it is the one people read after they have decided they are interested.",
            ],
          ),
        ],
        CASE_ROW,
      ),
      style: baseStyle({ margin: dim(0, 0, 0, 0) }),
      columnStyles: [cellFor({ over: true }), cellFor({ ruled: true, over: true })],
    },
  ],
};

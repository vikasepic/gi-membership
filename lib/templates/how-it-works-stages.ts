import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim } from "@/lib/blocks";

// "Six pieces. One complete funnel." — a heading and a line, a white panel
// holding the product shot, then four numbered stages ruled apart underneath.
//
// The stage row uses the same one-edge border the quadrant grid does: a rule
// to the LEFT of every stage but the first, which stacked becomes a rule above
// each. Four stages on a phone is four columns of two words otherwise.
//
// The screenshot is drawn art at the reference's own proportion, and it STAYS
// drawn art. A template is inserted onto pages nobody has thought of yet, so a
// real photograph shipped inside one arrives wherever it is dropped — someone
// else's product, or someone else's face, on a page they never agreed to. The
// page author puts the real picture in; the template supplies the shape.
/** A stage's column, and the rule that separates it from the one before. */
const stage = (ruled: boolean) =>
  col({
    padding: { t: 0, r: 22, b: 0, l: ruled ? 22 : 0, u: "px", link: false },
    ...(ruled
      ? {
          borderWidth: 1,
          borderSides: "left" as const,
          borderColor: "#e2ddd9",
          responsive: at({
            mobile: {
              style: {
                borderSides: "top",
                padding: { t: 20, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            },
          }),
        }
      : {}),
  });

const stageNo = (text: string) =>
  make(
    "text",
    { html: `<p>${text}</p>` },
    {
      color: "#c8663e",
      size: 14,
      weight: 600,
      lineHeight: 1.3,
      width: "auto",
      maxWidthValue: null,
      blockAlign: "left",
      margin: { t: 0, r: 0, b: 8, l: 0, u: "px", link: false },
    },
  );

const stageTitle = (text: string) =>
  make(
    "heading",
    { text, tag: "h3" },
    {
      color: "#1f1f1f",
      size: 17,
      weight: 700,
      lineHeight: 1.3,
      margin: { t: 0, r: 0, b: 8, l: 0, u: "px", link: false },
    },
  );

const stageBody = (text: string) =>
  make(
    "text",
    { html: `<p>${text}</p>` },
    {
      color: "#4a4a4a",
      size: 14,
      lineHeight: 1.55,
      width: "auto",
      maxWidthValue: null,
      blockAlign: "left",
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  );

export const template: Template = {
  id: "how-it-works-stages",
  name: "How it works — panel and stages",
  group: "How it works",
  band: { style: "paper", color: "#f2e8e3", layout: { width: "boxed", maxWidth: 1100 } },
  blocks: [
    {
      ...make(
        "heading",
        { text: "Six pieces. One complete funnel.", tag: "h2" },
        {
          color: "#11325b",
          size: 34,
          weight: 700,
          lineHeight: 1.2,
          margin: { t: 0, r: 0, b: 12, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ mobile: { style: { size: 26 } } }),
    },
    make(
      "text",
      {
        html: "<p>You answer the questions. The tool does the writing. You review each piece, edit inline, or send feedback to regenerate.</p>",
      },
      {
        color: "#3d3d3d",
        size: 15,
        lineHeight: 1.6,
        width: "custom",
        maxWidthValue: 560,
        maxWidthUnit: "px",
        margin: { t: 0, r: 0, b: 28, l: 0, u: "px", link: false },
      },
    ),
    {
      ...rowOf(
        [
          [
            make(
              "image",
              {
                url: "/templates/sections/stage-screens.svg",
                alt: "Five screens from the funnel builder",
                ratio: "auto",
                maxWidth: 100,
              },
              {
                width: "auto",
                maxWidthValue: null,
                blockAlign: "left",
                margin: { t: 0, r: 0, b: 34, l: 0, u: "px", link: false },
              },
            ),
          ],
        ],
        { gap: 0 },
      ),
      style: baseStyle({ margin: dim(0, 0, 0, 0) }),
      columnStyles: [
        col({
          background: fill("#ffffff"),
          radius: 20,
          padding: { t: 34, r: 34, b: 10, l: 34, u: "px", link: false },
        }),
      ],
    },
    {
      ...rowOf(
        [
          [stageNo("Stage 01"), stageTitle("Market and customer"), stageBody("Who you serve, what problem you solve, what good looks like after. We check it before you do anything else.")],
          [stageNo("Stage 02"), stageTitle("Pick the offer"), stageBody("Five low-ticket offers tailored to your market. Pick one, or bring your own.")],
          [stageNo("Stage 03"), stageTitle("Validate"), stageBody("Revenue goal, audience size, distribution. We tell you if the math works before you write a word.")],
          [stageNo("Stage 04"), stageTitle("Generate"), stageBody("Product outline, sales letter, emails, socials, ads, post-purchase. One piece at a time, locked until the one before is approved.")],
        ],
        { widths: [25, 25, 25, 25], gap: 0, verticalAlign: "stretch", stack: "mobile" },
      ),
      // Inside the white panel, not under it: the row is the panel's second
      // half, so it carries the same fill and closes the card's bottom.
      style: baseStyle({
        background: fill("#ffffff"),
        radius: 20,
        padding: dim(6, 34, 34, 34),
        margin: dim(0, 0, 0, 0),
      }),
      columnStyles: [stage(false), stage(true), stage(true), stage(true)],
    },
  ],
};

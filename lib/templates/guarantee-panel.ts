import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim } from "@/lib/blocks";

// The guarantee: a white card on paper, the seal on the left, the promise and
// its three steps on the right.
//
// The seal is a picture rather than a drawn badge, because a guarantee mark is
// the one graphic on a sales page people actually look at, and a CSS
// approximation of a starburst reads as a CSS approximation of a starburst.
//
// The card is a two-column row inside a column with the white fill — the row
// holds the two halves, and the column around it is the card.
export const template: Template = {
  id: "guarantee-panel",
  name: "Guarantee — seal and terms",
  group: "Callouts",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 980 } },
  blocks: [
    {
      ...rowOf(
        [
          [
            make(
              "image",
              {
                url: "/templates/sections/guarantee-seal.svg",
                alt: "Money-back guarantee",
                ratio: "auto",
                maxWidth: 100,
              },
              {
                width: "custom",
                maxWidthValue: 200,
                maxWidthUnit: "px",
                blockAlign: "center",
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
          [
            {
              ...make(
                "heading",
                {
                  text: "Try Everything for 7 days.\nIf it is not a fit, Get Your Money Back.",
                  tag: "h2",
                },
                {
                  color: "#11325b",
                  size: 27,
                  weight: 700,
                  lineHeight: 1.3,
                  margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false },
                },
              ),
              responsive: at({ mobile: { style: { size: 21 } } }),
            },
            make(
              "text",
              {
                html: [
                  "<p>Join with confidence, explore the program fully, and keep your power to choose.</p>",
                  "<p>You should not have to gamble to grow your business.</p>",
                  "<p>Here is how the seven-day guarantee works:</p>",
                ].join(""),
              },
              {
                color: "#3d3d3d",
                size: 15,
                lineHeight: 1.7,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 16, l: 0, u: "px", link: false },
              },
            ),
            make(
              "iconlist",
              {
                items: [
                  { text: "You join Scale to a Million today." },
                  {
                    text: "For the next 7 days, you can log in, watch the training, explore the templates, and see precisely what is inside.",
                  },
                  {
                    text: "If you feel the program is not right for you, write to my team within those 7 days to get a full refund.",
                  },
                ],
                layout: "stacked",
                iconSize: 16,
                gap: 14,
                iconColor: "#832a63",
              },
              {
                color: "#3d3d3d",
                size: 15,
                lineHeight: 1.55,
                margin: { t: 0, r: 0, b: 16, l: 0, u: "px", link: false },
              },
            ),
            make(
              "text",
              {
                html: [
                  "<p>If you love what you see, if the answer is yes, we keep building together.</p>",
                  "<p>If the answer is no, you get your money back, and you still gained clarity about what you want instead.</p>",
                  "<p>You are in control of this decision from start to finish.</p>",
                ].join(""),
              },
              {
                color: "#3d3d3d",
                size: 15,
                lineHeight: 1.7,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
        ],
        { widths: [26, 74], gap: 34, verticalAlign: "flex-start", stack: "mobile" },
      ),
      // The white card is the ROW's own box, not a wrapper around it. A row
      // cannot sit inside a column of another row — one level of nesting is
      // the whole tree — and it does not need to: a row block has a
      // background, a corner and a padding of its own, which is exactly a card
      // with two halves in it.
      style: baseStyle({
        background: fill("#ffffff"),
        radius: 20,
        padding: dim(44, 48, 44, 48),
        margin: dim(0, 0, 0, 0),
      }),
      columnStyles: [
        col({ padding: { t: 6, r: 0, b: 0, l: 0, u: "px", link: false } }),
        col(),
      ],
    },
  ],
};

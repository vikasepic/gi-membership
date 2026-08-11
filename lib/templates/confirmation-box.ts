import { at, col, fill, make, rowOf, type Template } from "./template";

// The confirmation panel: a plum-outlined white box with a seal sitting on its
// top edge, a two-line heading and one paragraph.
//
// A row of ONE column, because the box holds two blocks. Two blocks each given
// their own border would draw two boxes; the container that holds both is the
// column, and a column already has a background, a border, a corner and its
// own padding. Nothing here is a new capability — it is the row doing the job
// a row is for, with one column in it.
//
// The seal straddling the border sits OUTSIDE the row rather than inside it: a
// column with a background and a corner clips what overflows it, so a seal
// pulled above the panel from within would be cut in half by the very corner
// that makes it a panel. Above the row it is pulled down by a negative bottom
// margin instead, and given a z-index so it paints over the outline rather
// than under — which is what the z-index control exists for.
export const template: Template = {
  id: "confirmation-box",
  name: "Confirmation panel",
  group: "Callouts",
  band: { style: "paper", color: "#f6f6f6", layout: { width: "boxed", maxWidth: 860 } },
  blocks: [
    make(
      "image",
      { url: "/templates/sections/seal-check.svg", alt: "", ratio: "auto", maxWidth: 100 },
      {
        width: "custom",
        maxWidthValue: 56,
        maxWidthUnit: "px",
        blockAlign: "center",
        // Half the seal's height, so it sits astride the panel's top edge.
        margin: { t: 0, r: 0, b: -28, l: 0, u: "px", link: false },
        zIndex: 2,
      },
    ),
    {
      ...rowOf(
        [
          [
            {
              ...make(
                "heading",
                {
                  text: "You’re in.\nYour seat for the 10th May live webinar is confirmed.",
                  tag: "h2",
                },
                {
                  color: "#1f1f1f",
                  size: 25,
                  weight: 700,
                  lineHeight: 1.35,
                  textAlign: "center",
                  blockAlign: "center",
                  margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false },
                },
              ),
              responsive: at({
                tablet: { style: { size: 22 } },
                mobile: { style: { size: 19 } },
              }),
            },
            make(
              "text",
              {
                html: "<p>Your access to the AI Business Systems is granted. Expect it to be in your inbox in about 5 minutes from Greater Inside and Ajit Nawalkha.</p>",
              },
              {
                color: "#3d3d3d",
                size: 15,
                lineHeight: 1.65,
                textAlign: "center",
                blockAlign: "center",
                width: "custom",
                maxWidthValue: 620,
                maxWidthUnit: "px",
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
        ],
        { gap: 0 },
      ),
      columnStyles: [
        col({
          background: fill("#ffffff"),
          borderWidth: 2,
          borderColor: "#832a63",
          radius: 14,
          padding: { t: 54, r: 44, b: 44, l: 44, u: "px", link: false },
          responsive: at({
            mobile: { style: { padding: { t: 46, r: 22, b: 30, l: 22, u: "px", link: false } } },
          }),
        }),
      ],
    },
  ],
};

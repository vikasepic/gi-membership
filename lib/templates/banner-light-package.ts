import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim, type Block } from "@/lib/blocks";

// The white hero: the promise and two buttons on the left with a strip of
// facts under them, a numbered navy package panel on the right.
//
// The package list IS a cards block — numbered, inline number style, one
// column, tinted — because it is a set of like things in one panel, which is
// exactly what that block is for. The number before the title with the body
// hanging under it is the `inline` numberStyle, not a hand-built row.
//
// The four facts under the buttons are a row of four ruled columns, the same
// shape as the counter strip and for the same reason.

const NAVY = "#11325b";

const factCol = (value: string, note: string): Block[] => [
  make(
    "text",
    { html: `<p>${value}</p>` },
    {
      color: "#1f1f1f",
      blockAlign: "left",
      size: 15,
      weight: 700,
      lineHeight: 1.3,
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 4, l: 0, u: "px", link: false },
    },
  ),
  make(
    "text",
    { html: `<p>${note}</p>` },
    {
      color: "#6a6a6a",
      blockAlign: "left",
      size: 13,
      lineHeight: 1.4,
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  ),
];

const ruled = (on: boolean) =>
  col({
    padding: { t: 0, r: 14, b: 0, l: on ? 14 : 0, u: "px", link: false },
    ...(on
      ? {
          borderWidth: 1,
          borderSides: "left" as const,
          borderColor: "#e0e0e0",
          responsive: at({
            mobile: {
              style: {
                borderSides: "top",
                padding: { t: 12, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            },
          }),
        }
      : {}),
  });

export const template: Template = {
  id: "banner-light-package",
  name: "Hero — light, with package",
  group: "Hero",
  band: {
    style: "paper",
    color: "#ffffff",
    layout: { width: "boxed", maxWidth: 1160, pad: { t: 64, r: null, b: 64, l: null } },
  },
  blocks: [
    {
      ...rowOf(
        [
          [
            {
              ...make(
                "heading",
                { text: "Build The Entire\nLow-Ticket Funnel\nIn One Sitting.", tag: "h1" },
                {
                  color: "#1f1f1f",
                  size: 48,
                  weight: 700,
                  lineHeight: 1.1,
                  margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false },
                },
              ),
              responsive: at({
                tablet: { style: { size: 38 } },
                mobile: { style: { size: 30 } },
              }),
            },
            make(
              "text",
              {
                html: "<p>A product outline, a high-converting sales letter, launch emails, social posts, ads, and post-purchase emails. All written in your voice. All checked against your real market before a single word of copy gets written.</p>",
              },
              {
                color: "#3d3d3d",
                blockAlign: "left",
                size: 15,
                lineHeight: 1.65,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 24, l: 0, u: "px", link: false },
              },
            ),
            {
              ...rowOf(
                [
                  [
                    make(
                      "button",
                      { text: "Start 7-day free trial", link: "#", variant: "solid", action: "link" },
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
                    make(
                      "button",
                      { text: "See how it works ↓", link: "#", variant: "outline", action: "link" },
                      {
                        color: "#1f1f1f",
                        radius: 999,
                        borderWidth: 1,
                        borderColor: "#c8663e",
                        blockAlign: "left",
                        margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
                      },
                    ),
                  ],
                ],
                { widths: [50, 50], gap: 14, verticalAlign: "center", stack: "mobile" },
              ),
              style: baseStyle({ margin: dim(0, 0, 26, 0) }),
              columnStyles: [col(), col()],
            },
            {
              ...rowOf(
                [
                  factCol("$29/mo", "3 funnels per month"),
                  factCol("One sitting", "not six weeks"),
                  factCol(".docx export", "hand to your VA"),
                  factCol("~40 min", "your funnel package, ready"),
                ],
                { widths: [25, 25, 25, 25], gap: 0, verticalAlign: "stretch", stack: "mobile" },
              ),
              style: baseStyle({ margin: dim(0, 0, 22, 0) }),
              columnStyles: [ruled(false), ruled(true), ruled(true), ruled(true)],
            },
            make(
              "text",
              {
                html: "<p><strong>Built for:</strong> Coaches · Course creators · Consultants · Speakers</p>",
              },
              {
                width: "fit",
                maxWidthValue: null,
                blockAlign: "left",
                background: fill("#f2e8e3"),
                color: "#3d3d3d",
                size: 14,
                lineHeight: 1.4,
                radius: 6,
                padding: { t: 9, r: 14, b: 9, l: 14, u: "px", link: false },
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
          [
            make(
              "cards",
              {
                caption: "",
                title: "Your funnel package",
                items: [
                  { title: "Product outline", body: "", icon: "", image: "" },
                  { title: "High-converting sales letter", body: "", icon: "", image: "" },
                  { title: "6 launch emails", body: "", icon: "", image: "" },
                  { title: "3 social carousels", body: "", icon: "", image: "" },
                  { title: "3 ad variations", body: "", icon: "", image: "" },
                  { title: "2 post-purchase emails", body: "", icon: "", image: "" },
                ],
                note: "<strong>Voice match:</strong> Paste 200 words you've already written. Every piece lands in your voice, not generic AI copy.",
                columns: 1,
                // One panel holding compact numbered rows, which is exactly the
                // list skin — six separate boxes down the side of a hero is
                // twice the height of the copy beside it.
                skin: "list",
                numbered: true,
                numberStyle: "inline",
                media: "none",
              },
              {
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
        ],
        { widths: [54, 46], gap: 48, verticalAlign: "center", stack: "tablet" },
      ),
      style: baseStyle({ margin: dim(0, 0, 0, 0) }),
      columnStyles: [
        col(),
        col({
          background: fill(NAVY),
          radius: 16,
          padding: { t: 26, r: 26, b: 26, l: 26, u: "px", link: false },
        }),
      ],
    },
  ],
};

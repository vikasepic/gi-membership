import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim } from "@/lib/blocks";

// The photographic hero with the opt-in card: a full-bleed image with the
// promise over it on the left, and a white card on the right.
//
// ONE THING THIS TEMPLATE DOES NOT DO, on purpose: the card holds a button
// rather than a name-and-email form. Forms are stripped by the sanitizer on
// save — this page also carries the payment form, and a section that could
// introduce arbitrary inputs beside it is a section that can harvest a card
// number. So the card ends in a button, and the button goes wherever the real
// opt-in lives: the funnel app, an embed, a hosted page.
//
// Said here rather than discovered: a template that silently lost its inputs
// the first time it was saved would look like a bug in the builder.
//
// The photograph is the ROW's own background, not an image block, so the copy
// and the card sit ON it rather than under it.
export const template: Template = {
  id: "banner-image-optin",
  name: "Hero — photograph with opt-in card",
  group: "Hero",
  band: {
    style: "paper",
    color: "#f6f6f6",
    layout: { width: "boxed", maxWidth: 1160, pad: { t: 40, r: null, b: 40, l: null } },
  },
  blocks: [
    {
      ...rowOf(
        [
          [
            make(
              "text",
              { html: "<p>Start 2026 Right.</p>" },
              {
                color: "#e6e6e6",
                blockAlign: "left",
                size: 15,
                lineHeight: 1.4,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 14, l: 0, u: "px", link: false },
              },
            ),
            {
              ...make(
                "heading",
                { text: "Build a 2026 Plan\nThat You Will\nActually Use.", tag: "h1" },
                {
                  color: "#ffffff",
                  size: 46,
                  weight: 700,
                  lineHeight: 1.12,
                  margin: { t: 0, r: 0, b: 16, l: 0, u: "px", link: false },
                },
              ),
              responsive: at({
                tablet: { style: { size: 36 } },
                mobile: { style: { size: 28 } },
              }),
            },
            make(
              "text",
              {
                html: "<p>Access the 2026 planning Custom-GPT that helps you build a 2026 that adapts to your desires, goals, and challenges.</p>",
              },
              {
                color: "#dcdcdc",
                blockAlign: "left",
                size: 15,
                lineHeight: 1.6,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
          [
            make(
              "heading",
              { text: "Download the 2026 planning framework for founders.", tag: "h3" },
              {
                color: "#1f1f1f",
                size: 17,
                weight: 700,
                lineHeight: 1.35,
                margin: { t: 0, r: 0, b: 10, l: 0, u: "px", link: false },
              },
            ),
            make(
              "text",
              {
                html: "<p>A free, founder-friendly planning framework that actually works in achieving your dreams.</p>",
              },
              {
                color: "#4a4a4a",
                blockAlign: "left",
                size: 14,
                lineHeight: 1.55,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false },
              },
            ),
            make(
              "button",
              { text: "Submit", link: "#", variant: "solid", action: "link" },
              {
                background: fill("#c8663e"),
                color: "#ffffff",
                radius: 999,
                blockAlign: "center",
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
        ],
        { widths: [58, 42], gap: 40, verticalAlign: "flex-end", stack: "tablet" },
      ),
      // The photograph, darkened, as the row's own ground. An image block would
      // put the picture BESIDE the words; a background puts them on it.
      style: baseStyle({
        background: {
          ...fill("#12161c"),
          image: "/templates/sections/stage-portrait.svg",
          // A number, not a colour: the overlay is how much dark to lay over
          // the picture so pale type stays readable on whatever is behind it.
          overlay: 45,
        },
        radius: 18,
        padding: dim(56, 48, 40, 48),
        margin: dim(0, 0, 0, 0),
      }),
      columnStyles: [
        col(),
        col({
          background: fill("#ffffff"),
          radius: 14,
          padding: { t: 26, r: 26, b: 26, l: 26, u: "px", link: false },
        }),
      ],
    },
  ],
};

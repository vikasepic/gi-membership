import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim, type Block } from "@/lib/blocks";

// The enrolment hero: a terracotta bar across the top naming the next live
// call, then a dark photographic band with the promise and the button.
//
// ONE THING THIS TEMPLATE DOES NOT DO, on purpose: the four boxes in the bar
// are STATIC. A counting-down clock needs a script, and a section that can
// introduce arbitrary script is a section that can read the payment form on
// the same page — which is why the sanitizer strips them. The bar states the
// date and time, which is the part that is actually true; a clock that reads
// 00 : 00 : 00 : 00 because its script was stripped is worse than no clock.
//
// If a live countdown is wanted it belongs in the page's own custom code,
// where it is one decision by one person rather than a capability every
// section carries.

const BAR = "#c8663e";

const unit = (value: string, label: string): Block[] => [
  make(
    "text",
    { html: `<p>${value}</p>` },
    {
      color: "#ffffff",
      size: 19,
      weight: 700,
      lineHeight: 1.1,
      textAlign: "center",
      blockAlign: "center",
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 2, l: 0, u: "px", link: false },
    },
  ),
  make(
    "text",
    { html: `<p>${label}</p>` },
    {
      color: "#ffe3d6",
      size: 11,
      lineHeight: 1.2,
      textAlign: "center",
      blockAlign: "center",
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  ),
];

const box = () =>
  col({
    borderWidth: 1,
    borderColor: "#e9a385",
    radius: 8,
    padding: { t: 8, r: 6, b: 8, l: 6, u: "px", link: false },
  });

export const template: Template = {
  id: "banner-enrol-countdown",
  name: "Hero — enrolment, with call bar",
  group: "Hero",
  band: {
    style: "paper",
    color: BAR,
    layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 } },
  },
  blocks: [
    // The bar. Its own row so the copy and the four boxes sit on one line and
    // fall to two on a phone rather than squeezing to four characters wide.
    {
      ...rowOf(
        [
          [
            make(
              "text",
              { html: "<p>This month’s Live Call with Founder Ajit on 30th June, 9PM Dubai</p>" },
              {
                color: "#ffffff",
                size: 15,
                lineHeight: 1.4,
                textAlign: "center",
                blockAlign: "center",
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
          [
            {
              ...rowOf([unit("00", "Days"), unit("00", "Hours"), unit("00", "Minutes"), unit("00", "Seconds")], {
                widths: [25, 25, 25, 25],
                gap: 8,
                verticalAlign: "stretch",
              }),
              style: baseStyle({ margin: dim(0, 0, 0, 0) }),
              columnStyles: [box(), box(), box(), box()],
            },
          ],
        ],
        { widths: [62, 38], gap: 24, verticalAlign: "center", stack: "mobile" },
      ),
      style: baseStyle({ padding: dim(12, 32, 12, 32), margin: dim(0, 0, 0, 0) }),
      columnStyles: [col(), col()],
    },
    // The dark band under it.
    {
      ...rowOf(
        [
          [
            make(
              "text",
              { html: "<p>Enrollment Open Now…</p>" },
              {
                color: "#e9a385",
                blockAlign: "left",
                size: 15,
                weight: 600,
                lineHeight: 1.4,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 12, l: 0, u: "px", link: false },
              },
            ),
            make(
              "text",
              {
                html: "<p>For coaches, consultants, and expert-led service businesses just getting started</p>",
              },
              {
                color: "#dfe6f2",
                blockAlign: "left",
                size: 15,
                lineHeight: 1.5,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false },
              },
            ),
            {
              ...make(
                "heading",
                { text: "How Founders Reach\n$1M Without Working\n80-Hour Weeks", tag: "h1" },
                {
                  color: "#e8d3e0",
                  size: 44,
                  weight: 700,
                  lineHeight: 1.12,
                  margin: { t: 0, r: 0, b: 18, l: 0, u: "px", link: false },
                },
              ),
              responsive: at({
                tablet: { style: { size: 34 } },
                mobile: { style: { size: 27 } },
              }),
            },
            make(
              "text",
              {
                html: "<p><strong>A clear sequence for turning effort into traction without guessing, overbuilding, or spinning in circles.</strong></p>",
              },
              {
                color: "#ffffff",
                blockAlign: "left",
                size: 17,
                lineHeight: 1.5,
                width: "auto",
                maxWidthValue: null,
                margin: { t: 0, r: 0, b: 26, l: 0, u: "px", link: false },
              },
            ),
            make(
              "button",
              { text: "Enroll Now", link: "#", variant: "solid", action: "link" },
              {
                background: fill(BAR),
                color: "#ffffff",
                radius: 999,
                blockAlign: "left",
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
          [
            make(
              "image",
              {
                url: "/templates/sections/stage-portrait.svg",
                alt: "Ajit Nawalkha on stage",
                ratio: "auto",
                maxWidth: 100,
              },
              {
                width: "auto",
                maxWidthValue: null,
                blockAlign: "left",
                margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
              },
            ),
          ],
        ],
        { widths: [52, 48], gap: 32, verticalAlign: "center", stack: "tablet" },
      ),
      style: baseStyle({
        background: { ...fill("#0b1c33"), image: "/templates/sections/stage-glow.svg", overlay: 30 },
        padding: dim(56, 48, 56, 48),
        margin: dim(0, 0, 0, 0),
      }),
      columnStyles: [col(), col()],
    },
  ],
};

import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim } from "@/lib/blocks";

// The enrolment hero: a terracotta bar across the top naming the next live
// call, then a dark photographic band with the promise and the button.
//
// The bar holds a real Countdown block. It was four static "00" boxes, on the
// reasoning that a live clock needs script and script is stripped on save —
// true of an HTML block, and not true of a block the builder ships, which
// carries its own client leaf and needs nothing pasted in.
//
// THE DATE IS A PLACEHOLDER and must be changed. It is set to 21:00 in
// Asia/Dubai, which is what the line beside it says, and the zone is stored
// with it rather than inferred: a deadline without one is a wall-clock string
// that means a different moment to every reader, and shifts under whoever last
// edited the page. Change the date in the panel and it states the instant it
// resolved to, in that zone and in London, so a wrong day is visible before
// the page goes out.

const BAR = "#c8663e";

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
            // One block where four columns of static text used to be. The boxes
            // it draws are the same bordered squares, so the bar looks as it
            // did — they simply count now.
            make(
              "countdown",
              {
                kind: "date",
                due: "2027-06-30T21:00",
                zone: "Asia/Dubai",
                boxBackground: "transparent",
                boxBorderWidth: 1,
                boxBorderColor: "#e9a385",
                boxRadius: 8,
                boxPadding: 8,
                boxGap: 8,
                boxMinWidth: 62,
                digitSize: 19,
                digitWeight: "700",
                digitColor: "#ffffff",
                labelSize: 11,
                labelColor: "#ffe3d6",
              },
              {
                margin: dim(0, 0, 0, 0),
                width: "auto",
                maxWidthValue: null,
              },
            ),
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

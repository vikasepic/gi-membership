import { at, col, fill, make, rowOf, type Template } from "./template";
import { baseStyle, dim, type Block } from "@/lib/blocks";

// The plum sign-up band: the promise, one line under it, a bar of four facts
// about the event, then the button.
//
// A whole band rather than a card on one — which is what makes it the second
// sign-up design rather than a restyle of the first. The white card version
// interrupts a page; this one IS a page's worth of colour, and the two sit at
// different points in a funnel.
//
// The fact bar is four columns on a darker plum, separated by the same
// one-edge border the counter strip uses. Stacked on a phone the separators
// move to the top of each fact, so the bar becomes a short list rather than
// four columns two characters wide.

const FACT_RULE = "#a4548a";

const fact = (text: string): Block[] => [
  make(
    "text",
    { html: `<p>${text}</p>` },
    {
      color: "#ffffff",
      size: 17,
      weight: 700,
      lineHeight: 1.3,
      textAlign: "center",
      blockAlign: "center",
      width: "auto",
      maxWidthValue: null,
      margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
    },
  ),
];

const factCol = (ruled: boolean) =>
  col({
    padding: { t: 6, r: 10, b: 6, l: 10, u: "px", link: false },
    ...(ruled
      ? {
          borderWidth: 1,
          borderSides: "left" as const,
          borderColor: FACT_RULE,
          responsive: at({
            mobile: {
              style: {
                borderSides: "top",
                padding: { t: 10, r: 10, b: 6, l: 10, u: "px", link: false },
              },
            },
          }),
        }
      : {}),
  });

export const template: Template = {
  id: "signup-band",
  name: "Sign-up band — event facts",
  group: "Callouts",
  band: {
    style: "plum",
    layout: { width: "boxed", maxWidth: 1000, pad: { t: 48, r: null, b: 48, l: null } },
  },
  blocks: [
    {
      ...make(
        "heading",
        { text: "One Class. Six Skills. One Complete System.", tag: "h2" },
        {
          color: "#ffffff",
          size: 32,
          weight: 700,
          lineHeight: 1.25,
          textAlign: "center",
          blockAlign: "center",
          margin: { t: 0, r: 0, b: 12, l: 0, u: "px", link: false },
        },
      ),
      responsive: at({ tablet: { style: { size: 27 } }, mobile: { style: { size: 22 } } }),
    },
    make(
      "text",
      {
        html: "<p>See exactly what it takes to run a real business on it.<br />Then decide if you want to build it.</p>",
      },
      {
        color: "#f4e3ee",
        size: 16,
        lineHeight: 1.55,
        textAlign: "center",
        blockAlign: "center",
        width: "auto",
        maxWidthValue: null,
        margin: { t: 0, r: 0, b: 24, l: 0, u: "px", link: false },
      },
    ),
    {
      ...rowOf(
        [fact("Sunday, 10th May 2026"), fact("9:00 PM Dubai"), fact("Live on Zoom"), fact("Free")],
        {
          widths: [30, 24, 24, 22],
          gap: 0,
          verticalAlign: "center",
          stack: "mobile",
        },
      ),
      style: baseStyle({
        // A shade under the band, so the bar reads as inset rather than as a
        // second panel sitting on top of it.
        background: fill("#6f2352"),
        radius: 12,
        padding: dim(14, 20, 14, 20),
        margin: dim(0, 0, 22, 0),
      }),
      columnStyles: [factCol(false), factCol(true), factCol(true), factCol(true)],
    },
    make(
      "button",
      { text: "Reserve My Free Spot", link: "#", variant: "solid", action: "link" },
      {
        background: fill("#c8663e"),
        color: "#ffffff",
        radius: 999,
        blockAlign: "center",
        margin: { t: 0, r: 0, b: 0, l: 0, u: "px", link: false },
      },
    ),
  ],
};

import type { Block } from "@/lib/blocks";
import { at } from "./template";
import type { Template } from "./template";
import { AI, TYPE, box, column, copy, heading, paras, picture, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 1: the logo, an italic line with the date,
// the headline and the promise on the left; a cut-out portrait standing on
// the bottom edge on the right.
//
// PSD: content 145 to 1497 on 1600, so the box is 1352 wide and sits 21px
// right of centre; the logo 138 wide at 73 from the top; headline Inter Bold
// 42/68.3, promise Poppins Medium 22/34, portrait 455x631 on the band's floor.

export type HeroArt = { logo: string; portrait: string };

export function aiHero(art: HeroArt): Block {
  const words = [
    {
      ...picture(art.logo, "Greater Inside", { width: 138, mb: 72 }),
      responsive: at({ tablet: { style: { margin: box(0, 0, 48, 0) } }, mobile: { style: { margin: box(0, 0, 36, 0), maxWidthValue: 110 } } }),
    },
    copy(paras("<em>Live online. Saturday, October 17. Four and a half hours. Replays included.</em>"), {
      scale: [[16, 34], [15, 28], [14, 24]],
      mb: [13, 12, 10],
    }),
    heading("Get Five AI Team Members Working Inside Your Business in 90 Days, Without Hiring Anyone or Writing a Line of Code", {
      tag: "h1",
      scale: TYPE.h1,
      color: AI.navy,
      max: 880,
      mb: [23, 20, 16],
    }),
    copy(
      paras(
        "In 90 days, my team builds five AI team members inside your business, side by side with you. Your first one is working by week 2. Only 25 founders per cohort.",
      ),
      { scale: TYPE.lead, weight: 500, max: 735 },
    ),
  ];
  return section({
    bg: AI.white,
    max: 1352,
    // 52, not the logo's 73: the portrait stands 21px taller than the words,
    // and the band is as tall as the taller column.
    pad: [52, 0],
    tablet: [48, 0],
    mobile: [32, 0],
    // The design's content is not centred: it runs 145 to 1497. Nudged where
    // the window is wide enough to hold the whole 1352 box plus the nudge.
    css: "@media (min-width:1400px){selector>[data-row]{position:relative;left:21px}}",
    blocks: [
      split([words, [{ ...picture(art.portrait, "Ajit Nawalkha", { width: 455 }), responsive: at({ mobile: { style: { blockAlign: "center", maxWidthValue: 340 } } }) }]], {
        gap: 0,
        columns: [
          column({ colSize: "grow", padding: box(21, 0, 96, 0), responsive: at({ tablet: { style: { padding: box(0, 24, 48, 0) } }, mobile: { style: { padding: box(0, 0, 32, 0) } } }) }),
          column({
            colWidth: "custom",
            colWidthValue: 455,
            colWidthUnit: "px",
            colAlignSelf: "flex-end",
            responsive: at({
              tablet: { style: { colWidthValue: 320 } },
              mobile: { style: { colWidth: "full", colAlignSelf: "center" } },
            }),
          }),
        ],
      }),
    ],
  });
}

export const template: Template = {
  id: "ai-hero",
  name: "AI Team — logo, headline and standing portrait",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  // The art stays drawn: a template travels to pages nobody has thought of.
  blocks: [aiHero({ logo: "/templates/sections/way-inside.svg", portrait: "/templates/sections/stage-portrait.svg" })],
};

import type { Block } from "@/lib/blocks";
import { at, fill } from "./template";
import type { Template } from "./template";
import { AI, box, column, copy, heading, paras, picture, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 15: "Here Is What Changes Between Now and Day
// 90." — four milestones in circles of deepening navy joined by a line, what
// each one means under it, and a white box saying what it all is.
//
// PSD: circles 122 with a white ring and an 18px shadow at 13%; the line 1px
// #1f1f1f through their centres; milestones at 148, 488, 818 and 1154; the
// box 928 wide, 20px corners, Poppins Bold 18/34.

export type MilestoneArt = { day1: string; day2: string; week5: string; day90: string };

const STEPS: [keyof MilestoneArt, string, string][] = [
  ["day1", "On Day 1", "You stop guessing. You see AI team members working <br class=\"d\" />in a real business, and you choose the five jobs yours will own."],
  ["day2", "On Day 2", "You write your first AI team member's job, live, with my team beside you. By week 2, it is working on your real business."],
  ["week5", "By week 5", "My team is building the rest of your AI team, or teaching you to build it. From there, each one is coached, <br class=\"d\" />connected and battle tested on your real work."],
  ["day90", "By Day 90", "The follow-up, the drafts, the call prep and the morning numbers no longer wait on you. You know how to hire your sixth AI team member yourself, using the same job descriptions I use."],
];

const RIGHT = [90, 72, 72, 24];

export function aiMilestones(art: MilestoneArt): Block {
  return section({
    bg: AI.ash,
    max: 1302,
    pad: [109, 88],
    tablet: [64, 64],
    mobile: [44, 44],
    blocks: [
      heading("Here Is What Changes Between <br class=\"d\" />Now and Day 90.", { color: AI.navy, mb: [52, 40, 32], style: { margin: box(0, 0, 52, 2) } }),
      split(
        STEPS.map(([key, title, text]) => [
          picture(art[key], "", {
            width: 122,
            mb: 42,
            css: "selector img{border-radius:50%;background:#fff;padding:1px;box-shadow:0 0 18px #00000021}",
          }),
          copy(paras(`<strong>${title}</strong><br />${text}`), { color: AI.text }),
        ]),
        {
          widths: [26.1, 25.3, 25.8, 22.8],
          gap: 0,
          stack: "mobile",
          style: {
            margin: box(0, 0, 87, 0),
            // The line between the circles, behind them.
            customCss:
              "selector{position:relative;z-index:0}" +
              "selector::before{content:\"\";position:absolute;z-index:-1;left:56px;right:calc(22.8% - 62px);top:60px;height:1px;background:#1f1f1f}" +
              "@media (max-width:1023px){selector::before{display:none}}",
          },
          tablet: { props: { containerType: "grid", gridColumns: "2", columnGap: 0, rowGap: 0 }, style: { margin: box(0, 0, 56, 0) } },
          mobile: { style: { margin: box(0, 0, 40, 0) } },
          columns: RIGHT.map((r, i) =>
            column({
              padding: box(0, r, 0, 0),
              responsive: at({
                tablet: { style: { padding: box(i < 2 ? 0 : 36, 28, 0, 0) } },
                mobile: { style: { padding: box(i === 0 ? 0 : 32, 0, 0, 0) } },
              }),
            }),
          ),
        },
      ),
      split(
        [[copy(paras("<strong>That is the 90-Day AI Team Build. Two live days, five AI team members, 12 weeks of building <br class=\"d\" />with my team and the library behind my own AI team. All for $4,500.</strong>"), { color: AI.text })]],
        {
          gap: 0,
          style: { width: "custom", maxWidthValue: 928, maxWidthUnit: "px", margin: box(0, 0, 0, -2) },
          tablet: { style: { margin: box(0, 0, 0, 0) } },
          columns: [
            column({
              background: fill(AI.white),
              radius: 20,
              padding: box(30, 41, 46, 41),
              responsive: at({ tablet: { style: { padding: box(28, 32, 32, 32) } }, mobile: { style: { padding: box(24, 20, 26, 20) } } }),
            }),
          ],
        },
      ),
    ],
  });
}

export const template: Template = {
  id: "ai-milestones",
  name: "AI Team — four milestones joined by a line",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [
    aiMilestones({
      day1: "/templates/sections/seal-check.svg",
      day2: "/templates/sections/seal-check.svg",
      week5: "/templates/sections/seal-check.svg",
      day90: "/templates/sections/seal-check.svg",
    }),
  ],
};

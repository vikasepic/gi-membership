import type { Block } from "@/lib/blocks";
import { at } from "./template";
import type { Template } from "./template";
import { AI, box, column, copy, heading, paras, picture, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 5: "I Did Not Learn This From a Course." —
// the founder's record in white on navy, his portrait running off the right
// edge of the window.
//
// PSD: text 104 to 864 on 1600, the portrait 757x1017 from 902 with 20px
// corners, 76 below the band's top and 81 above its foot, cut by the edge.

export type FounderArt = { portrait: string };

export function aiFounderStory(art: FounderArt): Block {
  const words = [
    heading("I Did Not Learn This <br class=\"d\" />From a Course. <br class=\"d\" />I Run My Company on It.", { color: AI.white, mb: [27, 22, 18] }),
    copy(
      paras(
        "I co-founded Evercoach. We trained more than 500,000 coaches before Mindvalley acquired it.",
        "I served as CEO of Mindvalley and helped scale it to $40 million. Across my career, <br class=\"d\" />I have sold more than $57 million in coaching.",
        "We did all of that with big teams. I believe we could have reached far more people with the tools I have now.",
        "So today I run Greater Inside differently. More than half the work runs on AI.",
        "One AI team member writes this week's email to my list. One drafts my LinkedIn posts. One replies to Instagram comments and DMs in my voice. One pulls my ad and social numbers and sends me a report every morning.",
        "My entire business runs for under $5,000 a month. Content production. Email. <br class=\"d\" />Operations. Program delivery. Marketing. All of it.",
        "Through Inlo AI, my team builds custom AI systems for companies that have no engineers of their own. That team is on your side for 90 days.",
        "<em>I built it because I had to. Now I want to build it with you.</em>",
      ),
      { color: AI.white, style: { margin: box(0, 0, 0, 5) } },
    ),
  ];
  return section({
    bg: AI.navy,
    max: 1600,
    full: true,
    pad: [76, 81],
    tablet: [56, 56],
    mobile: [44, 0],
    // The text starts where a 1392 box would; the portrait runs to the
    // window's edge and is cut there, as drawn.
    css:
      "selector{overflow:hidden}" +
      "@media (min-width:1024px){selector{padding-left:max(24px,calc(50vw - 696px)) !important;padding-right:0 !important}}",
    blocks: [
      split(
        [
          words,
          [
            {
              // Never narrower than drawn on a laptop: the column is what is
              // left of the window, and the picture runs past it and is cut.
              ...picture(art.portrait, "Ajit Nawalkha", { width: 757, radius: 20, css: "@media (min-width:1024px){selector{min-width:757px}}" }),
              responsive: at({
                tablet: { style: { width: "auto", maxWidthValue: null } },
                mobile: { style: { width: "auto", maxWidthValue: null, radius: 0 } },
              }),
            },
          ],
        ],
        {
          gap: 38,
          align: "flex-start",
          tablet: { props: { widths: [55, 45], gap: 32 } },
          mobile: { props: { gap: 36 } },
          columns: [
            column({
              colWidth: "custom",
              colWidthValue: 760,
              colWidthUnit: "px",
              padding: box(26, 0, 0, 0),
              responsive: at({ tablet: { style: { colWidth: "full", padding: box(0, 0, 0, 0) } }, mobile: { style: { colWidth: "full" } } }),
            }),
            column({
              colWidth: "custom",
              colWidthValue: 1,
              colWidthUnit: "px",
              colSize: "grow",
              responsive: at({ tablet: { style: { colWidth: "full" } }, mobile: { style: { colWidth: "full", margin: box(0, -20, 0, -20) } } }),
            }),
          ],
        },
      ),
    ],
  });
}

export const template: Template = {
  id: "ai-founder-story",
  name: "AI Team — the founder's record, portrait off the edge",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [aiFounderStory({ portrait: "/templates/sections/portrait-2.svg" })],
};

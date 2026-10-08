import type { Block, BlockStyle } from "@/lib/blocks";
import { at, fill, make } from "./template";
import type { Template } from "./template";
import { AI, TICK, box, column, copy, heading, paras, picture, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 4: "Your First AI Team Member Is Working by
// Week 2." — the 90 days as a rail of stages, each with an orange ringed dot,
// two of them with four white question pills, the last with three cards.
//
// PSD: content 325 to 1275; the rail 1px black at 20% from the first dot to
// 35px above the cards' foot; dots a 25px ring round a 19px disc, centred on
// each stage title's first line; titles Poppins Bold 26/36 (20/36 for the
// two quieter ones), text Poppins 18/36 in #1f1f1f; pills 55 high, 10px
// corners; cards 258 wide, 27 apart.

export type TimelineArt = { screen: string; spark: string; gear: string };

const INK = AI.text;

/**
 * Hang a block on the rail: it starts at the rail, its words 32px in, and the
 * space under it is padding rather than margin so the line runs unbroken
 * through the gap. The last one stops the line 35px above its own foot. On a
 * laptop the words stop 78px short of the box, at the design's 827px measure.
 */
function onRail(b: Block, last = false): Block {
  const move = (s?: Partial<BlockStyle>): Partial<BlockStyle> =>
    s?.margin ? { ...s, margin: box(s.margin.t, s === b.style ? 78 : 0, 0, 12), padding: box(s.padding?.t ?? 0, s.padding?.r ?? 0, s.margin.b, 32) } : (s ?? {});
  const line = `selector{position:relative}selector::before{content:"";position:absolute;left:0;top:0;bottom:${last ? 35 : 0}px;width:1px;background:#00000033}`;
  return {
    ...b,
    style: { ...b.style, ...move(b.style), customCss: `${line}${b.style.customCss ?? ""}` } as Block["style"],
    responsive: b.responsive && {
      tablet: { ...b.responsive.tablet, style: move(b.responsive.tablet.style) },
      mobile: { ...b.responsive.mobile, style: move(b.responsive.mobile.style) },
    },
  };
}

/** The stage title, with its dot hung on the rail to its left. */
const stage = (text: string, size: 26 | 20) =>
  copy(paras(`<strong>${text}</strong>`), {
    scale: size === 26 ? [[26, 36], [23, 32], [20, 28]] : [[20, 36], [19, 32], [18, 28]],
    color: INK,
    mb: [10, 10, 8],
    css:
      `selector::after{content:"";position:absolute;left:-12px;top:calc(0.5lh - 12.5px);width:25px;height:25px;box-sizing:border-box;border:1px solid ${AI.orange};border-radius:50%;` +
      `background:radial-gradient(circle,${AI.orange} 0 9.5px,transparent 10px);box-shadow:0 0 5px #0000001c}`,
  });

const body = (html: string, mb: number) => copy(html, { scale: [[18, 36], [17, 32], [16, 28]], color: INK, mb: [mb, mb, Math.min(mb, 20)] });

/** One white pill with the circled tick. */
const pill = (text: string) => ({
  ...make(
    "iconlist",
    { items: [{ text }], layout: "stacked", marker: "fa", markerIcon: TICK, iconSize: 20, iconGap: 10, gap: 0, iconColor: AI.navy },
    {
      fontFamily: "Poppins",
      size: 16,
      lineHeight: 2.25,
      color: INK,
      background: fill(AI.white),
      radius: 10,
      padding: box(9.5, 16, 9.5, 17),
      margin: box(0, 0, 0, 0),
      customCss: "selector svg{margin-top:8px !important}@media (max-width:1023px){selector svg{margin-top:3px !important}}",
    },
  ),
  responsive: at({
    tablet: { style: { size: 16, lineHeight: 1.6, padding: box(14, 16, 14, 17) } },
    mobile: { style: { size: 15, lineHeight: 1.6, padding: box(12, 14, 12, 14) } },
  }),
});

/**
 * Four pills, two to a row. Two rows rather than two columns, so a phone
 * stacks them in reading order.
 */
const pills = (four: [string, string, string, string], mb: number) =>
  [[four[0], four[1]], [four[2], four[3]]].map(([a, b], i) =>
    split([[pill(a)], [pill(b)]], {
      widths: [51.5, 48.5],
      gap: 17,
      stack: "mobile",
      style: { margin: box(0, 0, i === 0 ? 16 : mb, 0) },
      tablet: { style: { margin: box(0, 0, i === 0 ? 16 : Math.round(mb * 0.7), 0) } },
      mobile: { props: { gap: 12 }, style: { margin: box(0, 0, i === 0 ? 12 : 40, 0) } },
    }),
  );

/** A white card: an icon, then a line about what you see. */
const seen = (icon: string, width: number, text: string) => [
  picture(icon, "", { width, mb: 11 }),
  copy(paras(text), { scale: [[16, 36], [16, 30], [15, 27]], color: INK }),
];

export function aiWeekTimeline(art: TimelineArt): Block {
  const rail = [
    stage("WEEK 1: Clarity, two days with me.", 26),
    body(
      paras(
        "You spend two live days with me, about 8 hours, in a small group of 25 founders. I look at what you actually work on, and we solve it together. By the end, you are clear on four things. <em>Live sessions are held on 31st October and 1st November.</em>",
      ),
      20,
    ),
    ...pills(["What you actually do in your business.", "How you do it, step by step.", "Which jobs an AI team member should own.", "Which jobs should stay with you."], 81),
    stage("WEEKS 2 TO 4:\u00a0 Creativity, with Coach Jill.", 26),
    body(
      paras(
        "Coach Jill from my team works with you as a group. Together, you design the system behind each job, step by step, in partnership with AI. Your first AI team member starts working on real tasks, so you see results in real time.",
      ),
      65,
    ),
    stage("Then my team builds.", 20),
    body(
      paras(
        "Once the process is clear, my team takes over. We log in to your Claude account and build your AI team for you. Or we teach you to build it yourself, if you prefer.",
      ),
      67,
    ),
    stage("WEEKS 5 TO 12: Coaching and Connectors.", 26),
    copy(
      paras(
        "You put each AI team member to work and check that it delivers the results you want. We connect it to your tools, so it runs on its own and takes in new data as it arrives. We keep coaching it, so it keeps getting better.",
        "This is also when you battle test your AI team. Together, we keep asking four questions.",
      ),
      { scale: [[18, 36], [17, 32], [16, 28]], color: INK, mb: [18, 18, 16] },
    ),
    ...pills(["What updates does it need?", "What is missing?", "Which job is not getting done?", "Which job could be done better?"], 80),
    stage("By week 12, your AI team runs on its own, keeps improving and is <br class=\"d\" />yours to direct.", 20),
    body(paras("Here is some of what you see in the two live days."), 13),
    split(
      [
        seen(art.screen, 28, "The AI team members <br class=\"d\" />that run Greater Inside, doing real work on my screen."),
        seen(art.spark, 33, "How to pick your first AI “hire”, so your first win comes fast."),
        seen(art.gear, 26, "Why most AI setups stop being used after a few weeks, and how to stop <br class=\"d\" />it happening to yours."),
      ],
      {
        gap: 27,
        stack: "mobile",
        mobile: { props: { gap: 16 } },
        columns: [0, 1, 2].map(() =>
          column({
            background: fill(AI.white),
            radius: 10,
            padding: box(24, 21, 25, 19),
            responsive: at({ mobile: { style: { padding: box(22, 20, 22, 20) } } }),
          }),
        ),
      },
    ),
  ];
  return section({
    bg: AI.fog,
    max: 950,
    pad: [78, 108],
    tablet: [64, 72],
    mobile: [44, 48],
    blocks: [
      heading("Your First AI Team Member Is <br class=\"d\" />Working by Week 2.", { mb: [21, 18, 14] }),
      copy(paras("Here is how the 90 days run. Each stage follows one of the 4 C's."), { mb: [58, 44, 32], style: { margin: box(0, 0, 58, 5) } }),
      ...rail.map((b, i) => onRail(b, i === rail.length - 1)),
    ],
  });
}

export const template: Template = {
  id: "ai-week-timeline",
  name: "AI Team — stages on a rail, with pills and cards",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [aiWeekTimeline({ screen: "/templates/sections/seal-check.svg", spark: "/templates/sections/seal-check.svg", gear: "/templates/sections/seal-check.svg" })],
};

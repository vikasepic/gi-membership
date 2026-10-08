import type { Block } from "@/lib/blocks";
import { at, fill, make } from "./template";
import type { Template } from "./template";
import { AI, box, column, copy, heading, paras, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 8: "What You Get Inside The 90-Day AI Team
// Build." — six white panels, each with a huge pale number behind its title,
// a plum edge underneath; then one panel split into who it is for and who it
// is not for.
//
// PSD: panels 1101 wide, 15px corners, a 3px plum shadow cast straight down,
// about 44 apart; numbers Poppins Bold 129px in #ead8e4; titles Poppins Bold
// 20/38, text Poppins 18/42, words 50 in from the left.

export type PanelItem = { title: string; text: string; note?: string };

export type FitArt = { yes: string; no: string };

const PANELS: PanelItem[] = [
  {
    title: "The Two-Day AI Team Immersive.",
    text: "Most founders never get past \"Where do I even start?\" These two days answer it for good. That is about 8 hours with me, in a group of only 25 founders. You watch AI team members work inside a real business. You see what is possible before you build a thing. Then you map where your hours go and pick the five jobs AI should own first. You log off on Day 2 with your first job written and ready to build. By week 2, that AI team member is working.",
    note: "Live sessions are held on 31st October and 1st November.",
  },
  { title: "Your AI Team Map.", text: "This one page ends the guessing. It names your five AI team members, the job each one owns and the order we build them in. You always know what is next, and you never wonder if you picked the wrong tool." },
  { title: "Five AI Team Members, Built With You.", text: "This is the part that changes your week. My team builds all five inside your own Claude account and tools, using the 4C AI Team Method. Or we teach you to build them yourself, if you prefer. Each one is trained on your voice and your offers. You own every one, and they keep working after the 90 days end." },
  { title: "12 Weeks of Live Build Sessions.", text: "Every week, we build with you on your real work. When something is off, we fix it in the session. This is where most programs leave you alone, and where we stay." },
  { title: "The Build Desk.", text: "Questions come up between sessions. The Build Desk is a direct line to my team. You never sit stuck for a week waiting for the next call." },
  { title: "Team Handoff Guides.", text: "Every AI team member comes with a simple guide. Your assistant or team can run it too, so the system keeps working when you step away." },
];

/** A white panel with the plum edge, as a one-column container. */
const panel = (cells: Block[][], o: { mb: number; pad?: [number, number, number, number]; widths?: number[]; columns?: ReturnType<typeof column>[] }) =>
  split(cells, {
    gap: 0,
    stack: "mobile",
    widths: o.widths,
    style: {
      background: fill(AI.white),
      radius: 15,
      padding: box(...(o.pad ?? [40, 41, 52, 50])),
      margin: box(0, 0, o.mb, 0),
      shadowX: 0,
      shadowY: 3,
      shadowBlur: 3,
      shadowColor: AI.plum,
    },
    tablet: { style: { padding: box(36, 32, 44, 40), margin: box(0, 0, Math.min(o.mb, 32), 0) } },
    mobile: { style: { padding: box(28, 20, 32, 22), margin: box(0, 0, Math.min(o.mb, 24), 0) } },
    columns: o.columns,
  });

/** The pale number, hung behind the title. The text sits above it. */
const numbered = (n: number, title: string) =>
  copy(paras(`<strong>${title}</strong>`), {
    scale: [[20, 38], [19, 34], [18, 30]],
    mb: [2, 2, 2],
    css:
      "selector{position:relative;z-index:0}" +
      `selector::before{content:"${String(n).padStart(2, "0")}";position:absolute;z-index:-1;left:-48px;top:-37px;` +
      // #ead8e4 at the PSD's 30% layer opacity.
      `font:700 129.4px/1 var(--font-poppins),sans-serif;color:${AI.pink}4d;pointer-events:none}` +
      "@media (max-width:767px){selector::before{font-size:96px;left:-18px;top:-30px}}",
  });

const above = "selector{position:relative;z-index:1}";

export function aiNumberedPanels(art: FitArt, items: PanelItem[] = PANELS): Block {
  const panels = items.map((it, i) =>
    panel(
      [
        [
          numbered(i + 1, it.title),
          copy(paras(it.text), { scale: [[18, 42], [17, 34], [16, 28]], css: above, mb: it.note ? [34, 24, 20] : 0 }),
          ...(it.note ? [copy(paras(`<em>${it.note}</em>`), { scale: [[18, 24], [17, 26], [16, 24]], css: above, style: { padding: box(0, 0, 7, 0) } })] : []),
        ],
      ],
      { mb: 44 },
    ),
  );
  const fit = (icon: string, size: number, iconGap: number, title: string, text: string) => [
    make(
      "iconlist",
      { items: [{ text: `<strong>${title}</strong>` }], layout: "stacked", marker: "image", markerImage: icon, iconSize: size, iconGap, gap: 0 },
      { fontFamily: "Poppins", size: 20, lineHeight: 1.9, color: AI.ink, margin: box(0, 0, 2, 0), customCss: "selector img{margin-top:9px !important}" },
    ),
    copy(paras(text), { scale: [[18, 34], [17, 30], [16, 28]] }),
  ];
  return section({
    bg: AI.white,
    max: 1101,
    pad: [88, 101],
    tablet: [64, 72],
    mobile: [44, 48],
    blocks: [
      heading("What You Get Inside <br class=\"d\" />The 90-Day AI Team Build.", { mb: [48, 40, 32], style: { margin: box(0, 0, 48, 12) } }),
      ...panels,
      panel(
        [
          fit(art.yes, 23, 14, "This is for you if", "You run a service business with paying clients. You know AI can help, but it has not changed how your week runs. You want it built properly, with people who do this every day."),
          fit(art.no, 20, 16, "This is not the right fit if you", "Want to become an AI developer. It is also not right if you are still looking for your first client."),
        ],
        {
          mb: 0,
          pad: [26, 41, 25, 49],
          widths: [52.6, 47.4],
          columns: [
            column({ padding: box(3, 74, 37, 0), responsive: at({ tablet: { style: { padding: box(0, 28, 8, 0) } }, mobile: { style: { padding: box(0, 0, 24, 0) } } }) }),
            column({
              padding: box(3, 0, 37, 67),
              borderWidth: 1,
              borderColor: AI.text,
              borderSides: "left",
              responsive: at({ tablet: { style: { padding: box(0, 0, 8, 28) } }, mobile: { style: { padding: box(24, 0, 0, 0), borderSides: "top" } } }),
            }),
          ],
        },
      ),
    ],
  });
}

export const template: Template = {
  id: "ai-numbered-panels",
  name: "AI Team — numbered panels with a fit / not-fit close",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [aiNumberedPanels({ yes: "/templates/sections/seal-check.svg", no: "/templates/sections/seal-check.svg" })],
};

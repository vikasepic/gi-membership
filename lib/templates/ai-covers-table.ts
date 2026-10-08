import type { Block } from "@/lib/blocks";
import { at } from "./template";
import type { Template } from "./template";
import { AI, box, card, column, copy, heading, paras, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 11: "Everything $4,500 Covers." — a white card
// on pink: what you get, why it matters and what it is worth, row by row,
// then the total and the two ways to pay.
//
// Two modules, the heading and the card, because the card's rows are rows
// themselves and a container may only hold one more level of them.
//
// PSD: card 1104 wide, 30px corners; heads Poppins Bold 22 in navy; rows
// Poppins 18/30 in #1f1f1f, values Poppins Bold 20 tracked 40 in orange;
// rules 1px at 30%, 24 above the words and 28 below.

export type CoverRow = { what: string; why: string; value: string };

const ROWS: CoverRow[] = [
  { what: "Two-Day AI Team Immersive", why: "You see AI working in a real business and <br class=\"d\" />leave with your first hire planned", value: "$2,000" },
  { what: "Your AI Team Map", why: "Your five jobs, in order, so you never guess <br class=\"d\" />what is next", value: "$1,500" },
  { what: "Five AI team members, <br class=\"d\" />built with you", why: "The work leaves your plate and stays <br class=\"d\" />off it", value: "$15,000" },
  { what: "12 weeks of live build <br class=\"d\" />sessions", why: "Every build gets tested and fixed on your <br class=\"d\" />real work", value: "$6,000" },
  { what: "The Build Desk", why: "You never sit stuck between sessions", value: "$2,000" },
  { what: "Team Handoff Guides", why: "Your team can run the system without you", value: "$1,500" },
  { what: "Bonus: My AI Team Library", why: "Proven job descriptions for every future hire", value: "$2,000" },
];

const NAVY_HEAD = { scale: [[22, 30], [20, 28], [18, 26]] as const, color: AI.navy };
const ROW = [[18, 30], [17, 28], [16, 26]] as const;
const VALUE = [[20, 30], [19, 28], [18, 26]] as const;
const valueCss = "selector{letter-spacing:0.8px}";

/** One ruled row of the table: three cells, a hairline under it. */
const tableRow = (cells: [Block, Block, Block], o: { pad: [number, number]; rule: boolean; hideOnPhone?: boolean }) =>
  split(
    cells.map((c) => [c]),
    {
      widths: [36.9, 48.9, 14.2],
      gap: 0,
      align: "flex-start",
      stack: "mobile",
      style: {
        padding: box(o.pad[0], 0, o.pad[1], 5),
        ...(o.rule ? { borderWidth: 1, borderColor: "#b2b2b2", borderSides: "bottom" as const } : {}),
        ...(o.hideOnPhone ? { hideMobile: true } : {}),
      },
      tablet: { style: { padding: box(Math.min(o.pad[0], 20), 0, Math.min(o.pad[1], 22), 0) } },
      mobile: { props: { gap: 4 }, style: { padding: box(16, 0, 16, 0) } },
      columns: [column({ padding: box(0, 16, 0, 0) }), column({ padding: box(0, 16, 0, 0) }), column({ padding: box(0, 12, 0, 0), responsive: at({ mobile: { style: { padding: box(0, 0, 0, 0) } } }) })],
    },
  );

export function aiCoversTable(rows: CoverRow[] = ROWS, money = { total: "$30,000", paid: "Your investment: $4,500 paid in full.", plan: "Or three monthly payments of 1,667(5,000 total)." }): Block[] {
  const head = section({
    bg: AI.pink,
    max: 1104,
    // The gap to the card is this module's foot: a flow drops its last block's margin.
    pad: [88, 48],
    tablet: [64, 40],
    mobile: [44, 32],
    blocks: [
      heading("Everything $4,500 Covers.", { color: "#030303", mb: [24, 20, 16], style: { margin: box(0, 0, 24, 4) } }),
      copy(paras("Every piece, and what it is worth."), { scale: [[20, 38], [18, 32], [16, 28]], color: "#030303", mb: [48, 40, 32], style: { margin: box(0, 0, 48, 3) } }),
    ],
  });
  const table = section({
    bg: AI.pink,
    max: 1104,
    pad: [0, 111],
    tablet: [0, 72],
    mobile: [0, 48],
    inner: card({ bg: AI.white, radius: 30, pad: [56, 58, 71, 52], tablet: [40, 32, 48, 32], mobile: [24, 18, 32, 18] }),
    blocks: [
      tableRow(
        [
          copy(paras("<strong>What you get</strong>"), NAVY_HEAD),
          copy(paras("<strong>Why it matters</strong>"), { ...NAVY_HEAD, style: { margin: box(0, 0, 0, 100) } }),
          copy(paras("<strong>Value</strong>"), { ...NAVY_HEAD, align: "right", style: { margin: box(0, -3, 0, 0) } }),
        ],
        { pad: [0, 19], rule: false, hideOnPhone: true },
      ),
      ...rows.map((r) =>
        tableRow(
          [
            { ...copy(paras(r.what), { scale: ROW, color: AI.text }), responsive: at({ mobile: { style: { size: 16, lineHeight: 1.6, weight: 700 } } }) },
            copy(paras(r.why), { scale: ROW, color: AI.text, max: 400 }),
            { ...copy(paras(`<strong>${r.value}</strong>`), { scale: VALUE, color: AI.orange, align: "right", css: valueCss }), responsive: at({ mobile: { style: { textAlign: "left", size: 18, lineHeight: 1.45 } } }) },
          ],
          { pad: [24, 28], rule: true },
        ),
      ),
      split(
        [
          [copy(paras("<strong>Total value</strong>"), { scale: [[24, 34], [22, 32], [20, 30]], color: AI.orange })],
          [copy(paras(`<strong>${money.total}</strong>`), { scale: [[30, 34], [28, 34], [26, 32]], color: AI.orange, align: "right", css: valueCss })],
        ],
        {
          gap: 0,
          align: "center",
          stack: "none",
          style: { padding: box(26, 12, 20, 5) },
          tablet: { style: { padding: box(22, 12, 16, 0) } },
          mobile: { style: { padding: box(18, 0, 12, 0) } },
        },
      ),
      copy(paras(`<strong>${money.paid}</strong>`, money.plan), { scale: ROW, color: AI.text, gap: 6 / 30, style: { margin: box(0, 0, 0, 7) } }),
    ],
  });
  return [head, table];
}

export const template: Template = {
  id: "ai-covers-table",
  name: "AI Team — everything it covers, a three-column table",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: aiCoversTable(),
};

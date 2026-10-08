import type { Block } from "@/lib/blocks";
import { at, fill, make } from "./template";
import type { Template } from "./template";
import { AI, TICK, box, column, copy, heading, paras, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 13 (and again at the end): "Claim Your Seat in
// the Founding Cohort." — everything included as a ticked list on the left;
// on the right a navy box with the value, the price, the plan, and two
// buttons, and a line for anyone who would rather talk.
//
// PSD: box 411 wide, 20px corners; "Total value:" and "YOUR INVESTMENT TODAY"
// Poppins Bold 20, $30,000 Bold 35, $4,500 Bold 60, $1,667 Bold 40, the plan
// line Poppins Italic 15; buttons 322x54, 26px corners, the first orange,
// the second outlined in orange; list Poppins 16/34 with a navy circled tick.
//
// The first button is the page's own buy control (`action: "buy"`): it goes
// to this offer's checkout at its real price whatever the label says. The
// second links to the plan's own checkout, which the page passes in.

export type ClaimLinks = { plan: string; call: string };

const ITEMS = [
  "<strong>The Two-Day AI Team Immersive.</strong> See AI team members work inside a real business and pick your five jobs. Your first hire is working by week 2. Live sessions are held on 31st October and 1st November.",
  "<strong>Your AI Team Map.</strong> One page that names your five AI team members and the order we build them in. You always know what comes next.",
  "<strong>Five AI team members, built with you.</strong> Trained on your voice and your offers, inside your own accounts. You own every one.",
  "<strong>12 weeks of live build sessions.</strong> Every week we build and test with you on your real work, and fix what is off.",
  "<strong>The Build Desk.</strong> A direct line to my team between sessions, so you never sit stuck.",
  "<strong>Team Handoff Guides.</strong> A simple guide for every AI team member, so your team can run it too.",
];
const BONUS = "<strong>My AI Team Library.</strong> The exact files behind my own AI team. When you want your sixth hire, you start from one that already works.";

const ticks = (items: string[], mb: number) => ({
  ...make(
    "iconlist",
    { items: items.map((text) => ({ text })), layout: "stacked", marker: "fa", markerIcon: TICK, iconSize: 20, iconGap: 9, gap: 34, iconColor: AI.navy },
    { fontFamily: "Poppins", size: 16, lineHeight: 2.125, color: AI.text, margin: box(0, 0, mb, 0), customCss: "selector svg{margin-top:9px !important}" },
  ),
  responsive: at({
    tablet: { style: { size: 16, lineHeight: 1.9 }, props: { gap: 24 } },
    mobile: { style: { size: 15, lineHeight: 1.8, customCss: "selector svg{margin-top:5px !important}" }, props: { gap: 18 } },
  }),
});

const centred = (html: string, scale: readonly [readonly [number, number], readonly [number, number], readonly [number, number]], mb: number, o: { italic?: boolean; color?: string } = {}) =>
  copy(paras(o.italic ? `<em>${html}</em>` : `<strong>${html}</strong>`), {
    scale,
    color: o.color ?? AI.white,
    align: "center",
    weight: o.italic ? 400 : 700,
    mb: [mb, mb, Math.min(mb, 16)],
  });

/** The buy button, restyled: the page's control brings its own classes. */
const BUY_CSS =
  "selector [data-buy]>span{display:block}" +
  "selector [data-buy] a{display:block;width:100%;padding:9px 16px;border-radius:26px;background:#c8653d;color:#fff;" +
  "font:700 18px/36px var(--font-poppins),sans-serif;text-align:center}" +
  "selector [data-buy] a:hover{background:#b3552f}";

export function aiClaimSeat(links: ClaimLinks, o: { top?: number; bottom?: number } = {}): Block {
  const box_ = [
    centred("Total value:", [[20, 34], [19, 32], [18, 30]], 0),
    centred("$30,000", [[35, 42], [32, 40], [30, 38]], 28),
    // 263 wide in a 323 column, by its margins: a centred box with a measure
    // collapses to nothing in the column's flex stack, and so did this line.
    make("divider", { thickness: 1, width: 100 }, { color: AI.white, margin: box(0, 30, 24, 30) }),
    centred("YOUR INVESTMENT TODAY", [[20, 34], [19, 32], [18, 30]], 0),
    centred("$4,500", [[60, 70], [54, 64], [48, 58]], 13),
    centred("paid in full, <br />or three monthly payments of", [[15, 28], [15, 26], [14, 24]], 17, { italic: true }),
    centred("$1,667", [[40, 34], [38, 40], [34, 38]], 35),
    make("button", { text: "Claim My Seat, $4,500", action: "buy", fullWidth: true }, { margin: box(0, 0, 4, 0), customCss: `selector{flex:0 0 100%}${BUY_CSS}` }),
    make(
      "button",
      { text: "3 Payments Of $1,667", link: links.plan, fullWidth: true },
      {
        background: fill(AI.navy),
        color: AI.white,
        radius: 26,
        padding: box(9, 16, 9, 16),
        fontFamily: "Poppins",
        size: 18,
        lineHeight: 2,
        weight: 700,
        margin: box(0, 0, 0, 0),
        customCss: `selector{flex:0 0 100%}selector a,selector span{border:1px solid ${AI.orange}}selector a:hover{background:#ffffff14 !important}`,
      },
    ),
    // Under the box on a laptop, hung below it so the list beside it sets the
    // band's height (the column's own clipping is lifted for it); inside the
    // box, in white, once the two stack.
    copy(paras("Need to talk to a human? <br />" + (links.call ? `<a href="${links.call}" rel="noopener noreferrer"><em>Book a Call with Natalia.</em></a>` : "<em>Book a Call with Natalia.</em>")), {
      scale: [[18, 28], [17, 28], [16, 26]],
      color: AI.white,
      align: "center",
      mb: [0, 0, 0],
      css:
        "selector em{font-weight:500}selector a{text-decoration:none;color:inherit}selector a:hover{text-decoration:underline}" +
        `@media (min-width:1024px){selector{position:absolute;left:0;right:0;top:calc(100% + 8px);color:${AI.text}}selector :where(p){color:${AI.text} !important}}` +
        "@media (max-width:1023px){selector{margin-top:24px !important}}",
    }),
  ];
  return section({
    bg: AI.mist,
    max: 1300,
    pad: [o.top ?? 106, o.bottom ?? 102],
    tablet: [o.top === undefined ? 64 : 32, 72],
    mobile: [o.top === undefined ? 44 : 24, 48],
    blocks: [
      heading("Claim Your Seat in the Founding Cohort.", { color: AI.navy, mb: [22, 20, 16] }),
      copy(paras("<strong>Here is everything you get for $4,500:</strong>"), { color: AI.text, mb: [42, 32, 24] }),
      split(
        [
          [
            ticks(ITEMS, 42),
            // The small pink tab that marks the last line as the bonus.
            make("text", { html: "<p><strong>Bonus:</strong></p>" }, {
              fontFamily: "Poppins",
              size: 14,
              lineHeight: 1.857,
              color: AI.text,
              textAlign: "center",
              background: fill("#e7dae4"),
              radius: 12,
              width: "custom",
              maxWidthValue: 84,
              maxWidthUnit: "px",
              blockAlign: "left",
              margin: box(0, 0, 4, 30),
              // The store's own paragraph spacing would hang under the word
              // and stretch the tab.
              customCss: "selector p{margin:0}",
            }),
            ticks([BONUS], 0),
          ],
          box_,
        ],
        {
          gap: 94,
          align: "flex-start",
          stack: "tablet",
          // The box starts 17px below the list's first line, and is what the
          // note under it hangs from.
          style: { customCss: "@media (min-width:1024px){selector>[data-row]>:nth-child(2){margin-top:17px;position:relative;overflow:visible !important}}@media (max-width:1023px) and (min-width:768px){selector>[data-row]>:nth-child(2){max-width:460px;margin-inline:auto}}" },
          tablet: { props: { gap: 40 } },
          columns: [
            column({ colSize: "grow", colWidth: "custom", colWidthValue: 1, colWidthUnit: "px", responsive: at({ tablet: { style: { colWidth: "full" } } }) }),
            column({
              colWidth: "custom",
              colWidthValue: 411,
              colWidthUnit: "px",
              background: fill(AI.navy),
              radius: 20,
              padding: box(42, 44, 42, 44),
              responsive: at({
                tablet: { style: { colWidth: "full", margin: box(0, 0, 0, 0) } },
                mobile: { style: { colWidth: "full", padding: box(32, 22, 32, 22) } },
              }),
            }),
          ],
        },
      ),
    ],
  });
}

export const template: Template = {
  id: "ai-claim-seat",
  name: "AI Team — what you get, beside the price box",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [aiClaimSeat({ plan: "", call: "" })],
};

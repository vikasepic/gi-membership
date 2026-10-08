import type { Block } from "@/lib/blocks";
import { at, fill, make } from "./template";
import type { Template } from "./template";
import { AI, box, copy, heading, paras, section } from "./ai-team-kit";

// 90-Day AI Team Build, section 9: "What This Would Cost You To Build Any
// Other Way." — three lines on navy, then a white card listing each piece and
// what it is worth, ruled, with the total in orange.
//
// PSD: card 947 wide, 30px corners; rows Poppins Bold 20 in #1f1f1f, values
// Poppins Bold 24 tracked 40 in orange, about 80 apart, 1px rules at 30%;
// the total in Inter Bold, 20 and 30.
//
// The figures are typed, not the offer's: they are what each piece is worth,
// not what anything costs. Nothing here is charged.

export type ValueRow = { label: string; amount: string };

const ROWS: ValueRow[] = [
  { label: "The Two-Day AI Team Immersive", amount: "$2,000" },
  { label: "Your AI Team Map", amount: "$1,500" },
  { label: "Five AI team members, built with you", amount: "$15,000" },
  { label: "12 weeks of live build sessions", amount: "$6,000" },
  { label: "The Build Desk", amount: "$2,000" },
  { label: "Team Handoff Guides", amount: "$1,500" },
];

export function aiValueStack(rows: ValueRow[] = ROWS, total = { amount: "$28,000", note: "before the bonus below." }): Block {
  return section({
    bg: AI.navy,
    max: 947,
    pad: [102, 104],
    tablet: [64, 72],
    mobile: [44, 48],
    blocks: [
      heading("What This Would Cost You <br class=\"d\" />To Build Any Other Way.", { color: AI.white, mb: [23, 20, 16], style: { margin: box(0, 0, 23, 2) } }),
      copy(
        paras(
          "Agencies that build custom AI agents for small businesses charge $7,500 or more per agent. <br class=\"d\" />Five agents at that rate cost $37,500 or more.",
          "Hiring one person to do this work costs more in a year than this whole program.",
          "Here is how we value what is inside, well below agency rates.",
        ),
        { scale: [[18, 38], [17, 32], [16, 28]], gap: 34 / 38, color: AI.white, mb: [49, 40, 32], style: { margin: box(0, 0, 49, 12) } },
      ),
      {
        ...make(
          "pricing",
          {
            items: rows,
            highlightLast: false,
            totalLabel: "TOTAL VALUE",
            totalAmount: total.amount,
            labelFont: "Poppins",
            labelSize: 20,
            labelWeight: "700",
            labelColor: AI.text,
            amountFont: "Poppins",
            amountSize: 24,
            amountWeight: "700",
            amountColor: AI.orange,
            rowPadY: 24.5,
            rowPadX: 2,
            ruleWidth: 1,
            ruleColor: "#b2b2b2",
            totalFont: "Inter",
            totalLabelSize: 20,
            totalAmountSize: 30,
            totalWeight: "700",
            totalColor: AI.orange,
            totalRuleWidth: 1,
          },
          {
            fontFamily: "Poppins",
            size: 20,
            lineHeight: 1.25,
            background: fill(AI.white),
            radius: 30,
            padding: box(16, 52, 4, 53),
            margin: box(0, 0, 0, 0),
            // Values sit 17px in from the rule's end; the total runs to it.
            customCss:
              "selector{border-radius:30px 30px 0 0}@media (max-width:767px){selector{border-radius:20px 20px 0 0}}" +
              "selector>div>div:not(:last-child)>span:last-child{margin-right:15px;letter-spacing:0.96px}" +
              "selector>div>div:last-child{padding-bottom:0 !important}" +
              "selector>div>div:last-child>span:first-child{margin-left:-2px}",
          },
        ),
        responsive: at({
          tablet: { style: { padding: box(12, 32, 4, 32) }, props: { labelSize: 18, amountSize: 22, rowPadY: 20 } },
          mobile: { style: { padding: box(8, 18, 4, 18), radius: 20 }, props: { labelSize: 16, amountSize: 18, rowPadY: 16, totalAmountSize: 26, totalLabelSize: 18 } },
        }),
      },
      // Under the total, as part of the card: the same white, the same corners below.
      copy(paras(total.note), {
        scale: [[12, 20], [12, 20], [12, 20]],
        font: "Inter",
        color: AI.orange,
        align: "right",
        style: {
          background: fill(AI.white),
          padding: box(0, 52, 28, 53),
          margin: box(0, 0, 0, 0),
          radius: 0,
          customCss: "selector{border-radius:0 0 30px 30px;margin-top:-1px}@media (max-width:767px){selector{border-radius:0 0 20px 20px}}",
        },
      }),
    ],
  });
}

export const template: Template = {
  id: "ai-value-stack",
  name: "AI Team — what each piece is worth, on navy",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [aiValueStack()],
};

import type { Block } from "@/lib/blocks";
import { at } from "./template";
import type { Template } from "./template";
import { AI, box, column, copy, heading, paras, rule, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 12a: "Why $4,500 Is the Right Number." — the
// argument, then two numbered reasons with big orange numerals, ruled apart.
//
// PSD: content 243 to 1354; numerals Poppins Medium 91/78 in orange,
// centred in a 122px column, 28 before the words; the rule 1px at 30%.

const NUM = [[91.3, 77.6], [72, 64], [56, 52]] as const;

const reason = (n: string, html: string, mb: number) =>
  split(
    [
      [copy(paras(n), { scale: NUM, weight: 500, color: AI.orange, align: "center" })],
      [copy(paras(html), { color: AI.text, max: 845 })],
    ],
    {
      gap: 28,
      align: "flex-start",
      stack: "none",
      style: { margin: box(0, 0, mb, 0) },
      tablet: { props: { gap: 20 } },
      mobile: { props: { gap: 14 }, style: { margin: box(0, 0, Math.min(mb, 24), 0) } },
      columns: [
        column({ colWidth: "custom", colWidthValue: 122, colWidthUnit: "px", padding: box(5, 0, 0, 0), responsive: at({ tablet: { style: { colWidthValue: 96 } }, mobile: { style: { colWidthValue: 64, padding: box(2, 0, 0, 0) } } }) }),
        column({ colSize: "grow", colWidth: "custom", colWidthValue: 1, colWidthUnit: "px" }),
      ],
    },
  );

export function aiTwoReasons(): Block {
  return section({
    bg: AI.white,
    max: 1111,
    pad: [104, 96],
    tablet: [64, 48],
    mobile: [44, 32],
    blocks: [
      heading("Why $4,500 Is the Right Number.", { color: AI.navy, mb: [33, 24, 18], style: { margin: box(0, 0, 33, 9) } }),
      copy(
        paras(
          "An agency would charge $37,500 or more for five custom builds. They would hand them over and walk <br class=\"d\" />away.",
          "Here you get all five built with you, plus 12 weeks of support while they settle in. You pay less than the <br class=\"d\" />cost of one agency-built agent.",
          "Why is it so cheap?",
        ),
        { color: AI.text, max: 930, mb: [35, 28, 24], style: { margin: box(0, 0, 35, 9) } },
      ),
      copy(paras("<strong>Two reasons:</strong>"), { scale: [[20, 34], [19, 32], [18, 30]], color: AI.text, mb: [35, 28, 20], style: { margin: box(0, 0, 35, 9) } }),
      reason(
        "01",
        "<strong>I want to be able to help a million founders get to a million.</strong> To do so, my products need to be able to help a lot of people. I make money on volume. The first 25 are lucky, when we report your success, the next batch might have 50, even 500.",
        29,
      ),
      { ...rule("#b2b2b2", { mb: 29, ml: 6, max: 1002 }), responsive: at({ mobile: { style: { margin: box(0, 0, 24, 0) } } }) },
      reason(
        "02",
        "<strong>I am a master of arbitrage.</strong> My team is across the globe. Which allows me to be able to get better prices based on global talent. The same quality of AI person in LA costs $150,000 a year. In Jaipur they cost $1500. I hire globally, and I pass you the wins.",
        51,
      ),
      copy(paras("For most service founders, one extra client covers it. Your follow-up AI team member alone can do that."), { color: AI.text, style: { margin: box(0, 0, 0, 10) } }),
    ],
  });
}

export const template: Template = {
  id: "ai-two-reasons",
  name: "AI Team — the price argued, two numbered reasons",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [aiTwoReasons()],
};

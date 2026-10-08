import type { Block } from "@/lib/blocks";
import { at } from "./template";
import type { Template } from "./template";
import { AI, box, copy, heading, paras, rule, section } from "./ai-team-kit";

// 90-Day AI Team Build, section 17: "Give Your Business the Team It Has Been
// Missing." — the last word before the second price box, ruled off from it.
//
// PSD: content from 146; words Poppins 18/34 in #1f1f1f to 1059; the rule
// 1px black at 50%, 938 wide, 55 under the words. The price box that follows
// is the Claim Your Seat module with its top air taken down to 48.

export function aiClosingWords(): Block {
  return section({
    bg: AI.mist,
    max: 1308,
    pad: [100, 0],
    tablet: [64, 0],
    mobile: [44, 0],
    blocks: [
      heading("Give Your Business the Team <br class=\"d\" />It Has Been Missing.", { color: AI.navy, mb: [24, 20, 16], style: { margin: box(0, 0, 24, 8) } }),
      copy(
        paras(
          "You have spent years getting good at what you do. Your clients feel it. Now your business can have help that keeps up with you.",
          "Twenty-five founders will start this cohort. Ninety days from now, they will have five AI team members doing the work that used to fill their evenings.",
          "Enrollment closes on 24th October.",
          "If your evenings still belong to your inbox, take your seat now.",
        ),
        { color: AI.text, max: 915, mb: [55, 40, 32], style: { margin: box(0, 0, 55, 6) } },
      ),
      { ...rule("#808080", { max: 938 }), responsive: at({ tablet: { style: { width: "auto", maxWidthValue: null } } }) },
    ],
  });
}

export const template: Template = {
  id: "ai-closing-words",
  name: "AI Team — the closing words, ruled off",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [aiClosingWords()],
};

import type { Block } from "@/lib/blocks";
import type { Template } from "./template";
import { AI, box, card, copy, heading, paras, section } from "./ai-team-kit";

// 90-Day AI Team Build, section 12b: "25 Seats. Here Is Why We Stop There." —
// one white card with a soft shadow, the scarcity said plainly.
//
// PSD: card 1111 wide, 25px corners, an 18px shadow at 27% black; words 82
// in from the left, 58 from the top.

export function aiSeatsCard(): Block {
  return section({
    bg: AI.white,
    max: 1111,
    pad: [96, 114],
    tablet: [48, 72],
    mobile: [32, 48],
    inner: card({ bg: AI.white, radius: 25, pad: [58, 60, 70, 82], tablet: [44, 40, 48, 44], mobile: [32, 20, 36, 22], shadow: { blur: 18, color: "#00000045" } }),
    blocks: [
      heading("25 Seats. <br class=\"d\" />Here Is Why We Stop There.", { color: AI.navy, mb: [24, 20, 16] }),
      copy(
        paras(
          "Every founder gets their AI team built with them. My team can only do that well for 25 businesses at a time.",
          "The founding price is for this cohort only. The next cohort will cost more or will have a lot more people.",
          "Enrollment closes on 24th October or when 25 seats are filled.",
        ),
        { color: AI.text },
      ),
    ],
  });
}

export const template: Template = {
  id: "ai-seats-card",
  name: "AI Team — why the seats are limited, in a card",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [aiSeatsCard()],
};

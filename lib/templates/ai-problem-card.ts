import type { Block } from "@/lib/blocks";
import type { Template } from "./template";
import { AI, box, card, copy, heading, paras, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 2: the problem, as one white card on a grey
// ground, closing on a navy panel that runs wider than the card's text.
//
// PSD: card 956 wide with 20px corners, 88 above it and 87 below; text 65 in
// from the left and 81 from the right; the navy panel 23 in from the card's
// left edge and 29 from its right, 20px corners.

export function aiProblemCard(): Block {
  return section({
    bg: AI.mist,
    max: 956,
    pad: [88, 87],
    tablet: [64, 64],
    mobile: [40, 40],
    inner: card({ bg: AI.white, radius: 20, pad: [64, 74, 58, 65], tablet: [52, 48, 48, 48], mobile: [36, 22, 28, 22] }),
    blocks: [
      // 50, not the 55 every other heading on the page is set in.
      heading("You Already Have More AI <br class=\"d\" />Than You Use.", { scale: [[50, 68], [40, 50], [30, 38]], mb: [16, 16, 14] }),
      copy(
        paras(
          "A ChatGPT login. A Claude account. A folder of saved posts about agents. <br class=\"d\" />A few programs you bought and meant to finish.",
          "Not one of them does a task in your business while you sleep.",
          "<em>That is not on you.</em> You built a business clients trust. Your work gets results, and people <br class=\"d\" />tell their friends.",
          "But the AI world runs on one model. It sells you a tool, then a program about the tool. <br class=\"d\" />Then it leaves you to build alone, on top of a full client load.",
          "So you buy the next program. You watch week one. A client needs you, and the program joins the others.",
          "I call it the AI pile. Tools you pay for every month. Programs you bought and never finished building. It gets taller every quarter.",
          "And every quarter, your business still runs on you.",
          "You still write the emails and prep every sales call. You still chase the lead who went quiet two weeks ago.",
          "Count the hours each week that go to work an assistant could do. Write that number down. Then multiply it by 52.",
        ),
        { mb: [20, 24, 20], style: { margin: box(0, 0, 20, 5) } },
      ),
      split(
        [
          [
            copy(
              paras(
                "There is a different way, and I run my own company on it. It starts with one shift in how you think about AI.",
                "If you joined the Million-Dollar Marketing System class, you saw marketing run as a system. The same kind of system can run almost every part of your business.",
              ),
              { color: AI.white },
            ),
          ],
        ],
        {
          gap: 0,
          // Wider than the card's text on both sides, as drawn.
          style: { margin: box(0, -52, 0, -42) },
          tablet: { style: { margin: box(0, 0, 0, 0) } },
          columns: [card({ bg: AI.navy, radius: 20, pad: [26, 52, 39, 47], tablet: [28, 32, 32, 32], mobile: [24, 20, 24, 20] })],
        },
      ),
    ],
  });
}

export const template: Template = {
  id: "ai-problem-card",
  name: "AI Team — the problem, in a card with a navy close",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [aiProblemCard()],
};

import type { Block } from "@/lib/blocks";
import { at, fill } from "./template";
import type { Template } from "./template";
import { AI, TYPE, box, column, copy, heading, paras, picture, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 3: "Stop Buying AI. Start Hiring It." — two
// lines in, the four steps of the method in one white card with hairlines
// between them, and the reasoning after it.
//
// PSD: content 150 to 1450; the card 1302 wide, 20px corners, an 18px soft
// shadow at 27% black; the steps at 23/27/26.6/23.4 of the card, each icon
// 85px, titles Poppins Bold 20/34, steps Poppins 16/34.

export type FourStepsArt = { clarity: string; creativity: string; coaching: string; connectors: string };

const STEPS = [
  ["clarity", "Clarity.", "First, we get clear on the exact job you need done. When AI does not know what the job <br class=\"d\" />is, it fails to deliver, no matter how good the tool is."],
  ["creativity", "Creativity.", "Next, we design the system that gets that job done best, step <br class=\"d\" />by step. This is where most founders get stuck. They ramble to AI about the task and hope it works out the steps on its own. We map the steps for it."],
  ["coaching", "Coaching.", "Then we work with your AI team member until it has every detail it needs. Your voice, your offers, your clients and your standards. This is how its work starts to match the quality you expect."],
  ["connectors", "Connectors.", "Finally, we connect it to what it needs to check its work and get better. The tools it pulls from, the results it checks and the data it verifies against."],
] as const;

export function aiFourSteps(art: FourStepsArt): Block {
  const steps = STEPS.map(([key, title, body]) => [
    {
      ...picture(art[key], "", { width: 85, mb: 12 }),
      responsive: at({ mobile: { style: { maxWidthValue: 64, margin: box(0, 0, 10, 0) } } }),
    },
    copy(paras(`<strong>${title}</strong>`), { scale: TYPE.label, mb: [6, 6, 4] }),
    copy(paras(body), { scale: TYPE.small }),
  ]);
  // A hairline down the left of every step but the first. Two by two on a
  // tablet, so the third step starts a row and loses its rule; stacked on a
  // phone, the rule moves to the top.
  const step = (i: number) =>
    column({
      // Each step's text frame sits where the PSD put it, not on a common grid.
      padding: box(16, [35, 31, 35, 0][i], 4, [0, 38, 45, 42][i]),
      ...(i === 0 ? {} : { borderWidth: 1, borderColor: AI.ink, borderSides: "left" as const }),
      responsive: at({
        tablet: { style: { padding: box(i < 2 ? 0 : 28, 24, i < 2 ? 28 : 0, i % 2 ? 28 : 0), borderWidth: i % 2 ? 1 : 0 } },
        mobile: { style: { padding: box(i === 0 ? 0 : 24, 0, i === 3 ? 0 : 24, 0), borderWidth: i === 0 ? 0 : 1, borderSides: "top" as const } },
      }),
    });
  return section({
    bg: AI.white,
    max: 1300,
    pad: [76, 79],
    tablet: [64, 64],
    mobile: [44, 44],
    blocks: [
      heading("Stop Buying AI. Start Hiring It.", { mb: [30, 24, 18] }),
      copy(
        paras(
          "Here is the shift. Bring AI into your business the way you would hire a great team member.",
          "I call it the 4C AI Team Method. Every AI team member we build goes through four steps.",
        ),
        { gap: 24 / 34, mb: [44, 36, 28] },
      ),
      split(steps, {
        widths: [22.9, 26.9, 26.5, 23.7],
        gap: 0,
        stack: "mobile",
        // The card is the row itself: white, rounded, a soft shadow all round.
        style: {
          margin: box(0, 0, 49, 0),
          padding: box(53, 36, 56, 40),
          background: fill(AI.white),
          radius: 20,
          shadowX: 0,
          shadowY: 0,
          shadowBlur: 18,
          shadowColor: "#00000045",
        },
        // Two by two on a tablet. A grid, because flex widths have to add up to 100.
        tablet: { props: { containerType: "grid", gridColumns: "2", columnGap: 0, rowGap: 0 }, style: { margin: box(0, 0, 40, 0), padding: box(36, 32, 36, 32) } },
        mobile: { style: { margin: box(0, 0, 32, 0), padding: box(28, 22, 28, 22) } },
        columns: [0, 1, 2, 3].map(step),
      }),
      copy(
        paras(
          "Here is the mistake I see most often. A founder sets up AI and gets some early results. Then the results stop improving, and the founder gets bored with them.",
          "That happens because there is no improvement loop. The loop only exists when AI is connected to things it can check and verify. Without that layer, your AI stays as good as it was on the day you set it up.",
          "With it, your AI team member gets better every month. That is why the AI team members we build keep getting used long after week two.",
          "You will not need to code or sit through tutorials. You bring what you know about your business. My team brings the build.",
        ),
        { max: 875 },
      ),
    ],
  });
}

export const template: Template = {
  id: "ai-four-steps",
  name: "AI Team — four steps in one card",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [
    aiFourSteps({
      clarity: "/templates/sections/seal-check.svg",
      creativity: "/templates/sections/seal-check.svg",
      coaching: "/templates/sections/seal-check.svg",
      connectors: "/templates/sections/seal-check.svg",
    }),
  ],
};

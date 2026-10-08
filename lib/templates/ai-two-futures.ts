import type { Block } from "@/lib/blocks";
import { at, fill } from "./template";
import type { Template } from "./template";
import { AI, box, column, copy, heading, paras, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 14: "A Year From Now, One of Two Things Will
// Be True." — two pale cards side by side on pink, one long one under them.
//
// PSD: cards 529 wide, 35 apart, 20px corners, white at 50% over #ead8e4;
// the heading centred on a 75px line; words Poppins 18/36.

const PALE = "#f5ebf2";

export function aiTwoFutures(): Block {
  const card = () =>
    column({
      background: fill(PALE),
      radius: 20,
      padding: box(37, 40, 51, 41),
      responsive: at({ tablet: { style: { padding: box(32, 28, 32, 28) } }, mobile: { style: { padding: box(26, 20, 26, 20) } } }),
    });
  return section({
    bg: AI.pink,
    max: 1094,
    pad: [90, 99],
    tablet: [64, 72],
    mobile: [44, 48],
    blocks: [
      heading("A Year From Now, <br class=\"d\" />One of Two Things Will Be True.", { align: "center", scale: [[55, 75], [42, 54], [32, 40]], mb: [36, 32, 24] }),
      split(
        [
          [
            copy(
              paras(
                "In the first version, your business still runs on you. The AI pile has two more programs on it, and starting feels further away than it does today.",
                "Nothing is wrong with you in that version. You are simply carrying the work of a whole team on <br class=\"d\" />your own.",
              ),
              { scale: [[18, 36], [17, 32], [16, 28]] },
            ),
          ],
          [
            copy(
              paras("In the second version, your AI team has been working for a full year. Your content gets drafted and your leads get followed up while you do the work only you can do."),
              { scale: [[18, 36], [17, 32], [16, 28]] },
            ),
          ],
        ],
        { gap: 35, stack: "mobile", style: { margin: box(0, 0, 34, 0) }, mobile: { props: { gap: 16 }, style: { margin: box(0, 0, 16, 0) } }, columns: [card(), card()] },
      ),
      split(
        [[copy(paras("You are the same person with the same skill in both versions. The only difference is the help you had."), { scale: [[18, 36], [17, 32], [16, 28]], align: "center" })]],
        {
          gap: 0,
          columns: [
            column({
              background: fill(PALE),
              radius: 20,
              padding: box(22, 40, 31, 40),
              responsive: at({ mobile: { style: { padding: box(22, 20, 22, 20) } } }),
            }),
          ],
        },
      ),
    ],
  });
}

export const template: Template = {
  id: "ai-two-futures",
  name: "AI Team — two futures, two cards and a line",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [aiTwoFutures()],
};

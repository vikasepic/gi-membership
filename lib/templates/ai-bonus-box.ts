import type { Block } from "@/lib/blocks";
import { at } from "./template";
import type { Template } from "./template";
import { AI, box, column, copy, heading, paras, picture, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 10: "One Bonus: The Playbook Behind My Own AI
// Team." — an outlined box: the bonus's icon beside the heading, then its
// name and value, then what it is.
//
// PSD: box 1308 wide, 1px navy outline, 15px corners; icon tile 127x132
// at 69/85 inside; name Poppins Bold 25/38 with the value in navy; text
// Poppins 20/38.

export type BonusArt = { icon: string };

export function aiBonusBox(art: BonusArt): Block {
  return section({
    bg: AI.white,
    max: 1308,
    pad: [103, 113],
    tablet: [64, 72],
    mobile: [44, 48],
    // The outlined box is the section's own column, so the icon row inside it
    // is only one container deep.
    inner: column({
      padding: box(76, 40, 64, 69),
      radius: 15,
      borderWidth: 1,
      borderColor: AI.navy,
      responsive: at({ tablet: { style: { padding: box(48, 40, 48, 40) } }, mobile: { style: { padding: box(32, 20, 32, 20) } } }),
    }),
    blocks: [
      split(
        [
          [{ ...picture(art.icon, "", { width: 127 }), responsive: at({ mobile: { style: { maxWidthValue: 88 } } }) }],
          [heading("One Bonus: <br class=\"d\" />The Playbook Behind My Own AI Team.", { color: "#030303" })],
        ],
        {
          gap: 25,
          align: "flex-start",
          stack: "mobile",
          style: { margin: box(0, 0, 47, 0) },
          tablet: { style: { margin: box(0, 0, 36, 0) } },
          mobile: { props: { gap: 20 }, style: { margin: box(0, 0, 28, 0) } },
          columns: [
            column({ colWidth: "custom", colWidthValue: 127, colWidthUnit: "px", padding: box(9, 0, 0, 0), responsive: at({ mobile: { style: { colWidth: "full", padding: box(0, 0, 0, 0) } } }) }),
            column({ colSize: "grow", colWidth: "custom", colWidthValue: 1, colWidthUnit: "px", responsive: at({ mobile: { style: { colWidth: "full" } } }) }),
          ],
        },
      ),
      copy(paras(`<strong>My AI Team Library <span style="color:${AI.navy}">($2,000 value)</span></strong>`), {
        scale: [[25, 38], [22, 34], [20, 30]],
        color: "#030303",
        mb: [36, 28, 20],
      }),
      copy(
        paras(
          "The job descriptions, prompts and skills behind the AI team members that run Greater Inside. These are the exact files my business uses every day. When you want your sixth hire, you start from a proven job description, so you never start from a blank page.",
        ),
        { scale: [[20, 38], [18, 32], [16, 28]], color: "#030303", max: 1100 },
      ),
    ],
  });
}

export const template: Template = {
  id: "ai-bonus-box",
  name: "AI Team — the bonus, in an outlined box",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [aiBonusBox({ icon: "/templates/sections/seal-check.svg" })],
};

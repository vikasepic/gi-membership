import type { Block } from "@/lib/blocks";
import { at } from "./template";
import type { Template } from "./template";
import { AI, box, copy, paras, picture, rule, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, the foot: the logo centred, a rule, the copyright on
// the left and the privacy policy on the right. For a page that hides the
// store's own footer (a band marked `no-store-chrome`).
//
// PSD: a 1px #787878 line along the top; the logo 129 wide, 28 down; the rule
// 1178 wide, 20 under the logo; the words Poppins 16/28, 6 under it.

export type FooterArt = { logo: string; privacy: string; year?: number };

export function aiPageFooter(art: FooterArt): Block {
  const line = "selector{border-top:1px solid #787878}";
  return section({
    bg: AI.ash,
    max: 1178,
    pad: [28, 8],
    tablet: [28, 12],
    mobile: [24, 16],
    css: line,
    blocks: [
      picture(art.logo, "Greater Inside", { width: 129, mb: 20, align: "center" }),
      { ...rule("#787878", { mb: 6 }), responsive: at({ mobile: { style: { margin: box(0, 0, 10, 0) } } }) },
      split(
        [
          [copy(paras(`© Greater Inside ${art.year ?? 2025}. All Rights Reserved.`), { scale: [[16, 28], [15, 26], [14, 24]], style: { margin: box(0, 0, 0, 3) } })],
          [copy(paras(`<a href="${art.privacy}" rel="noopener noreferrer">Privacy Policy</a>`), { scale: [[16, 28], [15, 26], [14, 24]], align: "right", css: "selector a{color:inherit;text-decoration:none}selector a:hover{text-decoration:underline}" })],
        ],
        { gap: 16, stack: "none", align: "center" },
      ),
    ],
  });
}

export const template: Template = {
  id: "ai-page-footer",
  name: "AI Team — logo, rule, copyright and privacy",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [aiPageFooter({ logo: "/templates/sections/way-inside.svg", privacy: "/privacy" })],
};

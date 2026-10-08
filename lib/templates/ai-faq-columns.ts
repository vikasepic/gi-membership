import type { Block } from "@/lib/blocks";
import { at, make } from "./template";
import type { Template } from "./template";
import { AI, box, column, heading, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 16: "Questions Founders Ask Before Saving
// Their Seat." — two independent columns of questions, every answer open,
// each ruled off underneath.
//
// Two FAQ blocks, one per column, rather than one block in a grid: the
// design's columns do not line up row by row, and the page's FAQ markup
// reads both blocks either way.
//
// PSD: questions Poppins Bold 18/36, answers Poppins Light 18/38 in #1f1f1f,
// 22 between them; rules 1px #bebfc1, 58 under an answer and 60 over the next
// question; columns 633 and 662 wide, 108 apart.

export type Faq = { q: string; a: string };

const LEFT: Faq[] = [
  { q: "I am not technical. Will I keep up?", a: "Yes. My team does the building. You bring what you know about your business." },
  { q: "How much time do I need each week?", a: "About 1 hour for the live session. To answer questions. You will be working in group to get the details from your business on documents. Add a little time to try each AI team member on your work." },
  { q: "Which tools will my AI team run on?", a: "We will use Claude and Grok Bot to build the entire architecture." },
  { q: "What happens after 90 days?", a: "Everything is built in your accounts. You own it, and it keeps running." },
];
const RIGHT: Faq[] = [
  { q: "I have bought AI programs before and never finished them. <br class=\"d\" />Why is this different?", a: "Those programs taught you and left the building to you. Here, my team builds with you every week until all five AI team members are working." },
  { q: "AI tools change every month. Will this be out of date?", a: "We build around the jobs in your business. When a better tool shows up, the job stays the same and we update the build." },
  { q: "What if I cannot attend both days live?", a: "Every session is recorded. It is highly recommended that you attend the live session so you can have clarity on what you mean to build. <strong>Live sessions are held on 31st October and 1st November.</strong>" },
];

const FAQ_CSS =
  "selector .grid{display:block !important}" +
  "selector .grid>div{padding:60px 0 58px;border-bottom:1px solid #bebfc1}" +
  "selector .grid>div:first-child{padding-top:0}" +
  `selector h3{font:700 18px/36px var(--font-poppins),sans-serif !important;color:${AI.text} !important;margin:0}` +
  `selector p{margin:22px 0 0 !important;font:300 18px/38px var(--font-poppins),sans-serif !important;color:${AI.text} !important}` +
  "selector p strong{font-weight:700}" +
  "@media (max-width:1399px){selector br.d{display:none}}" +
  "@media (max-width:1023px){selector .grid>div{padding:36px 0 34px}selector h3{font-size:17px !important;line-height:30px !important}selector p{margin-top:12px !important;font-size:17px !important;line-height:30px !important}}" +
  "@media (max-width:767px){selector .grid>div{padding:28px 0 26px}selector h3{font-size:16px !important;line-height:28px !important}selector p{font-size:16px !important;line-height:28px !important}}";

const faqBlock = (items: Faq[]) => make("faq", { items, layout: "open" }, { margin: box(0, 0, 0, 0), customCss: FAQ_CSS });

export function aiFaqColumns(left: Faq[] = LEFT, right: Faq[] = RIGHT): Block {
  return section({
    bg: AI.white,
    max: 1404,
    pad: [96, 104],
    tablet: [64, 64],
    mobile: [44, 44],
    blocks: [
      heading("Questions Founders Ask <br class=\"d\" />Before Saving Their Seat.", { mb: [73, 40, 24], style: { margin: box(0, 0, 73, 2) } }),
      split([[faqBlock(left)], [faqBlock(right)]], {
        widths: [49.04, 50.96],
        gap: 108,
        align: "flex-start",
        stack: "tablet",
        tablet: { props: { gap: 0 } },
        // Stacked, the second column's first question needs the same air as the rest.
        columns: [column(), column({ responsive: at({ tablet: { style: { padding: box(36, 0, 0, 0) } }, mobile: { style: { padding: box(28, 0, 0, 0) } } }) })],
      }),
    ],
  });
}

export const template: Template = {
  id: "ai-faq-columns",
  name: "AI Team — open questions in two ruled columns",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [aiFaqColumns()],
};

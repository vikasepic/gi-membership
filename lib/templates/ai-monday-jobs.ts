import type { Block } from "@/lib/blocks";
import { at } from "./template";
import type { Template } from "./template";
import { AI, box, column, copy, heading, paras, picture, rule, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 6: "Here Is What a Monday Looks Like on Day
// 90." — four short paragraphs, then the jobs founders hand over, each an
// icon tile beside a bold line and its description, ruled off.
//
// PSD: content 325 to 1282; tiles 58px at the left edge, text 21px after
// them; titles Poppins Bold 18/34, descriptions Poppins 18/42; rules 1px
// black at 30%, 6px in from the left.

export type MondayArt = {
  content: string;
  followUp: string;
  sales: string;
  onboarding: string;
  report: string;
  inbox: string;
  hiring: string;
};

const JOBS: [keyof MondayArt, string, string][] = [
  ["content", "A content team member that writes in your voice", "Posts and newsletters start as drafts that sound like you. Thursday night stops <br class=\"d\" />being the night you stare at a blank page."],
  ["followUp", "A follow-up team member that never forgets a lead.", "Every lead gets a reply and a follow-up on time. The people who were ready to buy stop slipping away."],
  ["sales", "A sales team member that briefs you before every call.", "You walk in knowing who they are and what they need. After the call, your notes and follow-up are already written."],
  ["onboarding", "An onboarding team member that welcomes every client.", "New clients get a smooth first week. That holds whether you are on stage or <br class=\"d\" />on holiday."],
  ["report", "A morning report waiting before your coffee.", "Leads, sales, cash and what needs you today, on one page. You stop digging through five tools to know how the business is doing."],
  ["inbox", "An inbox and calendar team member.", "Routine replies get drafted for you. Meetings get booked without the back and forth."],
  ["hiring", "Plus, the skill to keep hiring.", "By week 12, you know how to build your sixth one yourself. AI becomes part of how you work every day."],
];

export function aiMondayJobs(art: MondayArt): Block {
  const jobs = JOBS.flatMap(([key, title, text], i) => [
    split(
      [
        [picture(art[key], "", { width: 58 })],
        [
          // The first title's full stop is regular weight in the design.
          copy(paras(i === 0 ? `<strong>${title}</strong>.` : `<strong>${title}</strong>`), { mb: [4, 4, 4] }),
          copy(paras(text), { scale: [[18, 42], [17, 34], [16, 28]], max: 760 }),
        ],
      ],
      {
        gap: 21,
        align: "flex-start",
        stack: "none",
        style: { margin: box(0, 0, i === 0 ? 20 : 28, 0) },
        tablet: { props: { gap: 18 }, style: { margin: box(0, 0, 24, 0) } },
        mobile: { props: { gap: 14 }, style: { margin: box(0, 0, 20, 0) } },
        columns: [
          column({
            colWidth: "custom",
            colWidthValue: 58,
            colWidthUnit: "px",
            padding: box(9, 0, 0, 0),
            responsive: at({ mobile: { style: { colWidthValue: 44, padding: box(4, 0, 0, 0) } } }),
          }),
          column({ colSize: "grow", padding: box(0, 0, 0, 0) }),
        ],
      },
    ),
    {
      ...rule("#bbbbbb", { mb: i === JOBS.length - 1 ? 0 : 33, ml: 6 }),
      responsive: at({ tablet: { style: { margin: box(0, 0, i === JOBS.length - 1 ? 0 : 28, 0) } }, mobile: { style: { margin: box(0, 0, i === JOBS.length - 1 ? 0 : 22, 0) } } }),
    },
  ]);
  return section({
    bg: AI.white,
    max: 957,
    pad: [91, 98],
    tablet: [64, 64],
    mobile: [44, 44],
    blocks: [
      heading("Here Is What a Monday <br class=\"d\" />Looks Like on Day 90.", { mb: [19, 18, 14] }),
      copy(
        paras(
          "You open your laptop. Your morning report is already waiting. Every lead from last week got a reply and a follow-up.",
          "Your posts for the week sit in drafts, written in your voice. Your first call is in an hour, and the brief is already in your inbox.",
          "You spend the morning on the work only you can do.",
          "Your five get chosen on Day 1, from your business. Here are the jobs founders hand over most often.",
        ),
        { max: 893, mb: [52, 40, 32], style: { margin: box(0, 0, 52, 4) } },
      ),
      ...jobs,
    ],
  });
}

export const template: Template = {
  id: "ai-monday-jobs",
  name: "AI Team — a ruled list of jobs with icon tiles",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [
    aiMondayJobs({
      content: "/templates/sections/seal-check.svg",
      followUp: "/templates/sections/seal-check.svg",
      sales: "/templates/sections/seal-check.svg",
      onboarding: "/templates/sections/seal-check.svg",
      report: "/templates/sections/seal-check.svg",
      inbox: "/templates/sections/seal-check.svg",
      hiring: "/templates/sections/seal-check.svg",
    }),
  ],
};

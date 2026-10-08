import type { Block } from "@/lib/blocks";
import { at, fill } from "./template";
import type { Template } from "./template";
import { AI, box, column, copy, heading, paras, picture, section, split } from "./ai-team-kit";

// 90-Day AI Team Build, section 7: "Founders Who Built AI Into Their Business
// With Me Kept Using It." — three white cards on navy, each a photo, a bold
// quote, what they said after, and who they are; two notes underneath.
//
// PSD: cards 401 wide, 11 apart, 20px corners; photos inset 24, 20px
// corners; quotes Poppins Bold 16/24, the rest Poppins 14/28 with the name
// in bold on a 36 line; the notes white Poppins 18/24. The words run 12px
// past the photo's right edge, as the PSD's text frames do.

export type ProofPerson = { photo: string; quote: string; said: string; who: string };

const PEOPLE: Omit<ProofPerson, "photo">[] = [
  {
    quote: "\"By the end I wasn't just learning concepts, <br class=\"d\" />I was putting full working systems in place.\"",
    said: "I knew AI could help my business, but I didn't know <br class=\"d\" />where to start. The structure let me build one <br class=\"d\" />step at a time.",
    who: "-Jillian Merlo, Founder, Calgary, Canada",
  },
  {
    quote: "\"Both combine teaching with immediate, <br class=\"d\" />hands-on application, which sets you up <br class=\"d\" />to actually execute, not just learn. Fast.\"",
    said: "Greater Inside covers a lot of ground, but two <br class=\"d\" />programs stood out for me: Build Your AI System <br class=\"d\" />and Build Your Digital Product",
    who: "-Miruna Parchirie, Life Coach, Barcelona, Spain",
  },
  {
    quote: "\"The program gave me clarity, practical <br class=\"d\" />tools, an AI-powered business system, <br class=\"d\" />and the ongoing support I needed to <br class=\"d\" />launch my business.\"",
    said: "Today, I run my coaching business with confidence <br class=\"d\" />and am publishing my first book.",
    who: "-Renu Singh, Executive and Life Coach, Phoenix",
  },
];

/** The three people's words with whatever photos the page supplies. */
export const proofPeople = (photos: [string, string, string]): ProofPerson[] =>
  PEOPLE.map((p, i) => ({ ...p, photo: photos[i] }));

export function aiFounderProof(people: ProofPerson[]): Block {
  const cards = people.map((p) => [
    picture(p.photo, p.who.replace(/^-/, "").split(",")[0], { radius: 20, mb: 19 }),
    copy(paras(`<strong>${p.quote}</strong>`), { scale: [[16, 24], [16, 24], [16, 24]], mb: [19, 16, 14], style: { margin: box(0, -12, 19, 7) } }),
    copy(paras(p.said), { scale: [[14, 28], [14, 26], [14, 24]], style: { margin: box(0, -12, 0, 7) } }),
    copy(paras(`<strong>${p.who}</strong>`), { scale: [[14, 36], [14, 32], [14, 30]], style: { margin: box(0, -12, 0, 7) } }),
  ]);
  return section({
    bg: AI.navy,
    max: 1225,
    pad: [89, 94],
    tablet: [64, 64],
    mobile: [44, 44],
    blocks: [
      heading("Founders Who Built AI Into Their Business <br class=\"d\" />With Me Kept Using It.", { color: AI.white, mb: [33, 24, 18], style: { margin: box(0, 0, 33, 9) } }),
      copy(
        paras("This is the founding cohort of this program. These results come from founders who built AI into their business in my earlier programs."),
        { scale: [[18, 36], [17, 30], [16, 28]], color: AI.white, max: 841, mb: [43, 36, 28], style: { margin: box(0, 0, 43, 6) } },
      ),
      split(cards, {
        gap: 11,
        stack: "mobile",
        tablet: { props: { gap: 12 }, style: { margin: box(0, 0, 40, 0) } },
        style: { margin: box(0, 0, 54, 0) },
        columns: [0, 1, 2].map(() =>
          column({
            background: fill(AI.white),
            radius: 20,
            padding: box(29, 23, 30, 24),
            responsive: at({ tablet: { style: { padding: box(16, 14, 24, 14) } }, mobile: { style: { padding: box(20, 18, 28, 18) } } }),
          }),
        ),
      }),
      copy(
        paras(
          "These are a few of more than 3,300 verified testimonials from founders I have taught and coached. <br class=\"d\" />You can read more at <strong>stories.greaterinside.com.</strong>",
          "Notice what they have in common. Every result came from building on a real business, with support. <br class=\"d\" />That is what the next 90 days are built around.",
        ),
        { scale: [[18, 24], [17, 28], [16, 26]], color: AI.white, max: 905, style: { margin: box(0, 0, 0, 6) } },
      ),
    ],
  });
}

// Dummy people, as every testimonial template has: a template is dropped onto
// pages nobody has thought of, and real names and faces must not travel with it.
const SAMPLE: ProofPerson[] = [1, 2, 3].map((n) => ({
  photo: `/templates/sections/portrait-${n}.svg`,
  quote: "\"The one sentence they would say to a friend about it.\"",
  said: "What changed for them, in their own words. Two or three short lines are enough.",
  who: "-Firstname Lastname, Role, City",
}));

export const template: Template = {
  id: "ai-founder-proof",
  name: "AI Team — three photo testimonial cards on navy",
  group: "90-Day AI Team Build",
  band: { layout: { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true } },
  blocks: [aiFounderProof(SAMPLE)],
};

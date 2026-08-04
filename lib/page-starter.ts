import { sectionToBlocks } from "@/lib/section-to-blocks";
import { SECTIONS, type SectionKey } from "@/lib/page-sections";
import type { Block } from "@/lib/blocks";

// The starter page.
//
// The layout and copy we built against greaterinside.com/funnel-kit, kept as
// SECTION CONTENT rather than as blocks — so it runs through the same
// converter every existing page does, and a change to the converter improves
// the starter for free instead of leaving it behind.
//
// The copy is Content Engine's, and every fact in it is one the store already
// states: $47 a month, seven days free, Instagram and LinkedIn, cancel in one
// click. There are no testimonials and no revenue figures, because there are
// none to quote. On any other product this is a starting shape to write over,
// not copy to keep — which is why it is behind a button someone has to press
// rather than a default that arrives on its own.

const STARTER_CONTENT: Record<string, Record<string, unknown>> = {
  hero: {
    prehead: "One time only, and only because you just bought the guide.",
    headline: "You have the playbook. Now get the week of content written.",
    subhead: "Content Engine reads what is already working in your niche, pulls out the hook behind each post, and drafts your carousels, reels and posts in your voice. You edit and publish.",
    bullets: [
      { text: "Niche research, run for you" },
      { text: "Carousels, reels and posts, drafted" },
      { text: "Written in your voice, not generic AI copy" },
      { text: "One place to plan and publish" },
      { text: "Instagram and LinkedIn" },
      { text: "Yours to keep and edit" },
    ],
    ctaLabel: "Add Content Engine — 7 days free",
    ctaSecondary: "See how it works",
    ctaNote: "Nothing charged today. Cancel in one click before day eight.",
    audience: "Built for: Coaches · Consultants · Course creators · Founders",
    packageTitle: "What you get",
    packageNote: "Voice match: paste 200 words you have already written. Every draft lands in your voice, not generic AI copy.",
    facts: [],
    stats: [
      { value: "$47/mo", label: "After the trial" },
      { value: "7 days", label: "Free" },
      { value: "2", label: "Platforms" },
      { value: "1 click", label: "To cancel" },
    ],
  },
  offer: {
    heading: "Six pieces. One week of content.",
    note: "You add a few competitors. It does the rest, every week.",
    modules: [
      { title: "Niche research", body: "The posts actually performing in your space, and the hook behind each one." },
      { title: "Carousels", body: "Slide by slide, from a proven angle rather than a blank page." },
      { title: "Reels", body: "Hooks and scripts, written to be spoken." },
      { title: "Posts", body: "Short-form for the days you have nothing planned." },
    ],
    stack: [], totalLabel: "", totalAmount: "",
    ctaLabel: "Add Content Engine — 7 days free",
    ctaNote: "Nothing charged today. Cancel in one click before day eight.",
  },
  problem: {
    heading: "The guide will not post for you.",
    lead: "Most people are stuck in one of these three.",
    traps: [
      { title: "The blank page", body: "You sit down to write, you know the theory, and nothing comes. So the week goes by." },
      { title: "The guessing game", body: "You post what you hope will land instead of what already landed in your niche." },
      { title: "The two-week burst", body: "You go hard for a fortnight, life happens, and the account goes quiet again." },
    ],
    chips: [
      { text: "I know I should post, I just never know what to say" },
      { text: "I open the app, stare at it, and close it again" },
      { text: "I have been meaning to be consistent for months" },
    ],
    feels: "I am not disciplined enough to keep this up.",
    truth: "Nobody gave you a repeatable way to turn what is already in your head into posts.",
  },
  solution: {
    heading: "Start from a draft, never from a blank page.",
    lead: "You answer a few questions about your niche. The tool does the writing, and you keep every edit.",
    steps: [
      { title: "It studies your niche", body: "Reads the top posts and reels already performing where you compete." },
      { title: "It pulls out the hooks", body: "Breaks down why each one travelled, so you start from a proven angle." },
      { title: "It drafts in your voice", body: "Carousels, reels and posts you edit and publish — not generic captions." },
      { title: "You approve and publish", body: "Nothing leaves the app without you reading it first." },
    ],
    result: "A week of content ready to edit, in an afternoon rather than a weekend.",
  },
  benefits: {
    heading: "What you walk away with",
    items: [
      { title: "You become the name people think of", body: "Show up every week with something worth reading and you stop being one option among many.", icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><circle cx=\"12\" cy=\"12\" r=\"8\"/><path d=\"M12 8v5l3 2\"/></svg>" },
      { title: "You stop starting from zero", body: "Your best hooks and angles live in one place, ready to reuse.", icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M4 7h16M4 12h10M4 17h13\"/></svg>" },
      { title: "Your ideas become a body of work", body: "What is in your head turns into a searchable library that is yours.", icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M5 4h11l3 3v13H5z\"/><path d=\"M8 10h8M8 14h5\"/></svg>" },
      { title: "A week planned in an afternoon", body: "Research, drafting and scheduling in one sitting.", icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><rect x=\"4\" y=\"5\" width=\"16\" height=\"15\" rx=\"2\"/><path d=\"M4 10h16M9 3v4M15 3v4\"/></svg>" },
      { title: "A voice that stays yours", body: "It drafts from your own writing samples, not a house style.", icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M12 3l2.6 5.6L20 9.5l-4 4 1 6-5-2.8L7 19.5l1-6-4-4 5.4-.9z\"/></svg>" },
      { title: "Two platforms, one workflow", body: "Instagram and LinkedIn, planned side by side.", icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><rect x=\"3\" y=\"5\" width=\"8\" height=\"14\" rx=\"1.5\"/><rect x=\"13\" y=\"5\" width=\"8\" height=\"14\" rx=\"1.5\"/></svg>" },
    ],
  },
  authority: {
    heading: "Built by people who study what actually performs",
    body: "Greater Inside spends its days on one question: why does one post travel and a nearly identical one does not. Content Engine does what a good researcher does — reads the top posts, transcribes the reels, and breaks down the hook behind each one. Then it writes in your voice, and you approve every word.",
    imageUrl: "", figures: [],
    logosLabel: "Where the research comes from",
    logos: [],
  },
  proof: {
    heading: "Why this works",
    quotes: [],
    reasons: [
      { title: "It reads what already won", body: "Only posts that actually performed in your niche, not guesses." },
      { title: "It names the hook", body: "The specific reason each one travelled, written down." },
      { title: "You approve every word", body: "Nothing publishes without you. The voice stays yours." },
    ],
    note: "Until there are reviews worth quoting, the mechanism is the proof — and it is true today.",
  },
  value: {
    heading: "Everything here, priced the way you would pay for it otherwise.",
    options: [
      { label: "A content agency", amount: "$2,000+", note: "per month, ongoing" },
      { label: "An in-house hire", amount: "A salary", note: "months to ramp" },
      { label: "Doing it yourself", amount: "Your weekend", note: "every week" },
      { label: "Content Engine", amount: "$47", note: "per month" },
    ],
    checklist: [
      { text: "Niche research, run continuously" },
      { text: "Drafts in your voice, every week" },
      { text: "Planning and publishing in one place" },
      { text: "Instagram and LinkedIn" },
    ],
    priceNote: "Seven days free, then $47 a month. Cancel from your account in one click.",
    worth: [],
    ctaLabel: "Start 7 days free",
    priceEyebrow: "After the trial",
    priceBadge: "",
    secureNote: "Every order is processed on a secure server.",
  },
  guarantee: {
    heading: "Nothing today, and nothing at all if you cancel",
    body: "Your card is not charged until day eight. Cancel before then and you pay nothing — no partial month, no fee, no email to write.",
    points: [
      { text: "Seven days free, in full" },
      { text: "Cancel in one click from your account" },
      { text: "Anything drafted in the trial stays yours" },
    ],
    note: "",
  },
  faq: {
    heading: "FAQ",
    faqs: [
      { q: "Does it sound like me, or like AI?", a: "You give it samples of your own writing and it drafts from those. You edit every piece before it goes anywhere." },
      { q: "What if I cancel?", a: "Cancel in one click from your account. Before day eight you are charged nothing." },
      { q: "Which platforms?", a: "Instagram and LinkedIn — carousels, reels and posts." },
      { q: "Do I still own what it writes?", a: "Yes. It is yours to keep, edit and publish anywhere." },
      { q: "How long before I have something?", a: "Add a few competitors and the first drafts are waiting the same afternoon." },
      { q: "Is this the same as the guide?", a: "No. The guide taught you the method. This runs it for you every week." },
    ],
  },
  footer: {
    logoUrl: "",
    note: "© Greater Inside 2026. All rights reserved.",
    links: [
      { label: "Privacy Policy", url: "/privacy" },
      { label: "Terms & Conditions", url: "/terms" },
      { label: "Refunds", url: "/refunds" },
    ],
  },
  cta: {
    heading: "One login. One afternoon. A week of content.",
    checklist: [
      { text: "The research done for you" },
      { text: "Drafts in your own voice" },
      { text: "One place to plan and publish" },
      { text: "Cancel in one click" },
    ],
    ctaLabel: "Add Content Engine — 7 days free",
    ctaNote: "Nothing charged today. $47 a month after the trial.",
    priceEyebrow: "After the trial",
    priceBadge: "",
    secureNote: "Every order is processed on a secure server.",
    warningTitle: "And if you skip it?",
    warningBody: "Later becomes next week, and next week becomes next month. A year from now someone with the same expertise has the audience you wanted — not because they were better, but because they kept publishing and you did not.",
  },
};

/** Every section's starter blocks, keyed. Sections with no starter come back empty. */
export function starterBlocks(): Record<string, Block[]> {
  const out: Record<string, Block[]> = {};
  for (const def of SECTIONS) {
    out[def.key] = sectionToBlocks(def, STARTER_CONTENT[def.key] ?? {});
  }
  return out;
}

/** True when this page has a starter to offer. */
export const hasStarter = (key: string): boolean =>
  Boolean(STARTER_CONTENT[key as SectionKey]);

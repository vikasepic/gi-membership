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
    // No "because you just bought the guide": this page is the offer's own
    // sales page AND the post-checkout upsell, and copy that assumes a prior
    // purchase is wrong half the time it is read.
    prehead: "For the coach, consultant or creator who knows exactly what to say and never gets it posted.",
    headline: "Stop starting from a blank page.",
    subhead:
      "Content Engine reads what is already working in your niche, pulls out the hook behind each post, and drafts your carousels, reels and posts in your voice. You edit and publish.",
    bullets: [
      { text: "Niche research, run for you" },
      { text: "Carousels, reels and posts, drafted" },
      { text: "Written in your voice, not generic AI copy" },
      { text: "One place to plan and publish" },
      { text: "Instagram and LinkedIn" },
      { text: "Every draft yours to keep and edit" },
    ],
    ctaLabel: "Start 7 days free",
    ctaSecondary: "See how it works",
    // Prices are not typed into prose anywhere on this page. The price card
    // and the comparison read the offer's real figure, so nothing here can
    // quietly disagree with what the card charges.
    ctaNote: "Nothing charged today. Cancel in one click before day eight.",
    audience: "Built for: Coaches · Consultants · Course creators · Founders",
    packageTitle: "What you get",
    packageNote:
      "It learns your voice from posts you have already written, and you review every piece before anything goes out.",
    facts: [],
    stats: [
      { value: "7 days", label: "Free" },
      { value: "2", label: "Platforms" },
      { value: "3", label: "Formats" },
      { value: "1 click", label: "To cancel" },
    ],
  },
  problem: {
    heading: "You already know what to post. That is not the part that stops you.",
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
    lead: "You add a few accounts in your niche. It does the rest, every week, and you keep every edit.",
    steps: [
      { title: "It studies your niche", body: "Reads the top posts and reels already performing where you compete." },
      { title: "It pulls out the hooks", body: "Breaks down why each one travelled, so you start from a proven angle." },
      { title: "It drafts in your voice", body: "Carousels, reels and posts you edit and publish — not generic captions." },
      { title: "You review and post", body: "Nothing leaves the app without you reading it first. It never posts for you." },
    ],
    result: "A week of content ready to edit, in an afternoon rather than a weekend.",
  },
  benefits: {
    heading: "What you walk away with",
    items: [
      { title: "You become the name people think of", body: "Show up every week with something worth reading and you stop being one option among many.", icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M12 3l2.6 5.6L20 9.5l-4 4 1 6-5-2.8L7 19.5l1-6-4-4 5.4-.9z\"/></svg>" },
      { title: "You stop starting from zero", body: "Your best hooks and angles live in one place, ready to reuse.", icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M4 7h16M4 12h10M4 17h13\"/></svg>" },
      { title: "Your ideas become a body of work", body: "What is in your head turns into a searchable library that is yours.", icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M5 4h11l3 3v13H5z\"/><path d=\"M8 10h8M8 14h5\"/></svg>" },
      { title: "A week planned in an afternoon", body: "Research, drafting and planning in one sitting.", icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><rect x=\"4\" y=\"5\" width=\"16\" height=\"15\" rx=\"2\"/><path d=\"M4 10h16M9 3v4M15 3v4\"/></svg>" },
      { title: "A voice that stays yours", body: "It drafts from your own writing, and you edit before anything is published.", icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><path d=\"M4 20l4-1 9.5-9.5a2 2 0 0 0-2.8-2.8L5 16z\"/></svg>" },
      { title: "Two platforms, one workflow", body: "Instagram and LinkedIn, planned side by side.", icon: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\"><rect x=\"3\" y=\"5\" width=\"8\" height=\"14\" rx=\"1.5\"/><rect x=\"13\" y=\"5\" width=\"8\" height=\"14\" rx=\"1.5\"/></svg>" },
    ],
  },
  offer: {
    heading: "Six pieces. One week of content.",
    note: "It reads what already won before it writes a word. That is the difference between a draft and a guess.",
    modules: [
      { title: "Niche research", body: "The posts actually performing in your space, and the hook behind each one." },
      { title: "Carousels", body: "Slide by slide, from a proven angle rather than a blank page." },
      { title: "Reels", body: "Hooks and scripts, written to be spoken." },
      { title: "Posts", body: "Short-form for the days you have nothing planned." },
      { title: "The weekly planner", body: "One place to move each piece from draft to posted." },
      { title: "Your voice, learned", body: "From posts you have already written, so the drafts sound like you." },
    ],
    stack: [], totalLabel: "", totalAmount: "",
    ctaLabel: "Start 7 days free",
    ctaNote: "Nothing charged today. Cancel in one click before day eight.",
  },
  authority: {
    heading: "Built by people who study what actually performs",
    body:
      "Greater Inside spends its days on one question: why does one post travel and a nearly identical one does not. Content Engine does what a good researcher does — reads the top posts, transcribes the reels, and breaks down the hook behind each one. Then it writes in your voice, and you approve every word.",
    imageUrl: "", figures: [], logosLabel: "", logos: [],
  },
  proof: {
    heading: "Why this works",
    quotes: [], results: [],
    reasons: [
      { title: "It reads what already won", body: "Only posts that actually performed in your niche, not guesses." },
      { title: "It names the hook", body: "The specific reason each one travelled, written down." },
      { title: "You approve every word", body: "Nothing publishes without you. The voice stays yours." },
    ],
    note: "Until there are reviews worth quoting, the mechanism is the proof — and it is true today.",
  },
  value: {
    heading: "Everything here, priced the way you would pay for it otherwise.",
    worth: [],
    options: [
      { label: "A content agency", amount: "$2,000+", note: "per month, ongoing" },
      { label: "An in-house hire", amount: "A salary", note: "months to ramp" },
      { label: "Doing it yourself", amount: "Your weekend", note: "every week" },
      // Blank on purpose: the highlighted row shows the offer's real price.
      { label: "Content Engine", amount: "", note: "per month" },
    ],
    checklist: [
      { text: "Niche research, run continuously" },
      { text: "Drafts in your voice, every week" },
      { text: "Planning and publishing in one place" },
      { text: "Instagram and LinkedIn" },
    ],
    priceNote: "Seven days free. Cancel from your account in one click.",
    ctaLabel: "Start 7 days free",
    ctaNote: "",
    priceEyebrow: "After the trial",
    altPrice: "", altPeriod: "", priceBadge: "",
    secureNote: "Every order is processed on a secure server.",
  },
  guarantee: {
    heading: "Nothing today, and nothing at all if you cancel",
    body:
      "Your card is not charged until day eight. Cancel before then and you pay nothing — no partial month, no fee, no email to write.",
    points: [
      { text: "Seven days free, in full" },
      { text: "Cancel from your account settings at any time" },
      { text: "Anything drafted in the trial stays yours" },
    ],
    note: "",
  },
  faq: {
    heading: "FAQ",
    faqs: [
      { q: "Will I be charged today?", a: "No. The first seven days are free. You are charged only if you keep it past then." },
      { q: "How do I cancel?", a: "From your account settings, at any time. Cancel before day eight and you are not charged." },
      { q: "Who owns what I create?", a: "You do. Every draft is yours to edit, post, and keep." },
      { q: "Do I have to connect my Instagram?", a: "No. You can add competitor accounts and start from there. Connecting your own is optional and lets it learn your voice." },
      { q: "Does it post for me?", a: "No. It researches, drafts, and helps you plan. You review and post yourself, so nothing goes out that is not yours." },
      { q: "Will it sound like me?", a: "It can learn your style from your own posts and draft in it. You always edit before anything is published." },
      { q: "How long until my first drafts?", a: "An afternoon. Add a few accounts in your niche and your first hooks and drafts are ready to work from." },
      { q: "What does it cover?", a: "Instagram and LinkedIn — carousels, reels, and posts." },
    ],
  },
  cta: {
    heading: "One login. One afternoon. A week of content.",
    checklist: [
      { text: "The research done for you — the top posts in your niche, and the hooks behind them" },
      { text: "Drafts in your own voice, every week" },
      { text: "One place to plan and publish" },
      { text: "Cancel in one click" },
    ],
    ctaLabel: "Start 7 days free",
    ctaNote: "Nothing charged today. Cancel in one click before day eight.",
    priceEyebrow: "After the trial",
    altPrice: "", altPeriod: "", priceBadge: "",
    secureNote: "Every order is processed on a secure server.",
    warningTitle: "And if you skip it?",
    warningBody:
      "Later becomes next week, and next week becomes next month. A year from now someone with the same expertise has the audience you wanted — not because they were better, but because they kept publishing and you did not.",
  },
  footer: {
    logoUrl: "",
    note: "© Greater Inside. All rights reserved.",
    links: [
      { label: "Privacy Policy", url: "/privacy" },
      { label: "Terms & Conditions", url: "/terms" },
      { label: "Earnings Disclaimer", url: "https://greaterinside.com/earnings-disclaimer/" },
    ],
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

import { normalizeHex, readableInk, tint } from "@/lib/color";
import { isGlobalColor } from "@/lib/palette";

// The ten-section sales page.
//
// Ajit's structure, used by both the store sales page and the upsell page, so
// there is one argument and one editor rather than two systems that drift.
//
// The important decision is that sections are TYPED. A section that stores
// `heading` and `body` can only ever render as a heading and a body, which is
// exactly why the first draft of this read flat. A sequence stores steps, an
// offer stores stack lines with amounts, proof stores quotes with names — and
// the shape follows from the data rather than from styling on top of it.

// ---------------------------------------------------------------------------
// Band styles
// ---------------------------------------------------------------------------

/**
 * Presets rather than a free background picker.
 *
 * A band carries whole paragraphs, so the ground and the text have to move
 * together; an arbitrary hex behind body copy is how a section becomes
 * unreadable. The accent inside a band stays free, because it only ever marks
 * small things — buttons, step numbers, ticks — where readableInk can
 * guarantee the label on top of it.
 */
export const BAND_STYLES = {
  paper: { label: "Paper", bg: "#ffffff", fg: "#16181f", accent: "#b0532f", panel: "#f4f2ec", panel2: "#faf9f6" },
  cream: { label: "Cream", bg: "#fafaf8", fg: "#16181f", accent: "#b0532f", panel: "#f1efe9", panel2: "#ffffff" },
  sand: { label: "Sand", bg: "#f1efe9", fg: "#16181f", accent: "#b0532f", panel: "#ffffff", panel2: "#faf9f6" },
  rose: { label: "Rose", bg: "#f7e9ee", fg: "#3a2c34", accent: "#832a63", panel: "#ffffff", panel2: "#fdf6f9" },
  navy: { label: "Navy", bg: "#11325b", fg: "#e9effa", accent: "#c8653d", panel: "#1a4179", panel2: "#163865" },
  plum: { label: "Plum", bg: "#832a63", fg: "#fbeef5", accent: "#f3dbe9", panel: "#93336f", panel2: "#8d2e6a" },
} as const;

export type BandStyleKey = keyof typeof BAND_STYLES;
export const BAND_STYLE_KEYS = Object.keys(BAND_STYLES) as BandStyleKey[];

export type BandTheme = {
  bg: string;
  fg: string;
  accent: string;
  onAccent: string;
  panel: string;
  panel2: string;
  /** Hairline that reads on both light and dark grounds. */
  rule: string;
  muted: string;
};

/**
 * A band's ink is the band's own.
 *
 * Site typography has a body colour, and it deliberately does NOT reach here:
 * a band paints `color` inline on its own `<section>`, and the dark presets
 * choose a pale ink BECAUSE their ground is dark. One field repainting all six
 * is how a band becomes unreadable, which is the thing the presets exist to
 * prevent. There was a `siteColor` parameter for it that nothing ever passed —
 * see the Typography panel's note on Body, which now says so out loud.
 */
export function bandTheme(
  styleKey: string | null | undefined,
  accentOverride?: string | null,
): BandTheme {
  const s = BAND_STYLES[(styleKey ?? "paper") as BandStyleKey] ?? BAND_STYLES.paper;
  // Two values, one colour. The band DRAWS the reference, so changing that
  // global colour in settings repaints the band; the arithmetic — which ink is
  // readable on it — needs a real hex, and normalizeHex reads the one carried
  // inside the reference.
  const hex = normalizeHex(accentOverride, s.accent);
  const accent = isGlobalColor(accentOverride) ? accentOverride.trim() : hex;
  // The rule and the muted tone are the ink at two alphas, so they follow it
  // rather than being a second thing to keep in step.
  const fg = s.fg;
  return {
    bg: s.bg,
    fg,
    accent,
    onAccent: readableInk(hex),
    panel: s.panel,
    panel2: s.panel2,
    rule: tint(fg, 0.14),
    muted: tint(fg, 0.72),
  };
}

// ---------------------------------------------------------------------------
// Field definitions — what the editor renders, and what a section stores
// ---------------------------------------------------------------------------

export type SubField = { key: string; label: string; kind: "text" | "textarea" };

export type FieldDef =
  | { kind: "text"; key: string; label: string; hint?: string }
  | { kind: "image"; key: string; label: string; hint?: string }
  | { kind: "richtext"; key: string; label: string; hint?: string }
  | { kind: "textarea"; key: string; label: string; hint?: string; rows?: number }
  | { kind: "list"; key: string; label: string; hint?: string; item: SubField[]; addLabel: string };

export type SectionKey =
  | "hero"
  | "problem"
  | "solution"
  | "benefits"
  | "offer"
  | "authority"
  | "proof"
  | "value"
  | "guarantee"
  | "faq"
  | "cta"
  | "footer"
  // The storefront's own bands. Not part of a sales page, and a sales page
  // never offers them — see HOME_SECTIONS.
  | "welcome"
  | "browse"
  | "membership"
  | "closing";

export type SectionDef = {
  key: SectionKey;
  /** Ajit's numbering. The hero carries parts 1 and 2. */
  n: string;
  title: string;
  /** What the part is for, in one line. */
  purpose: string;
  /** The shape it renders as — so the editor says why the fields differ. */
  shape: string;
  defaultStyle: BandStyleKey;
  fields: FieldDef[];
  variants?: { key: string; label: string }[];
  defaults: Record<string, unknown>;
};

const row = (key: string, label: string, kind: "text" | "textarea" = "text"): SubField => ({ key, label, kind });

export const SECTIONS: SectionDef[] = [
  {
    key: "hero",
    n: "1 + 2",
    title: "Hero",
    purpose:
      "The single outcome, said once, above the fold — then the shortest possible proof that it is believable.",
    shape: "Copy left, a facts card right. Bullets under the sub-head, then an optional figures strip.",
    defaultStyle: "navy",
    fields: [
      { kind: "textarea", key: "prehead", label: "Pre-head", hint: "Who this is for. The wrong reader should leave here.", rows: 2 },
      { kind: "textarea", key: "headline", label: "Headline", hint: "One outcome. Not a description of the product — the thing they walk away with.", rows: 2 },
      { kind: "textarea", key: "subhead", label: "Sub-headline", hint: "Backs the promise and hints at the mechanism. One sentence.", rows: 3 },
      {
        kind: "list",
        key: "bullets",
        label: "What is in it",
        hint: "Four to six, each a deliverable rather than a feature. This is the first thing a skimmer reads.",
        item: [row("text", "Line")],
        addLabel: "Add a line",
      },
      { kind: "text", key: "ctaLabel", label: "Button" },
      { kind: "text", key: "ctaSecondary", label: "Second button", hint: "Optional. For the reader who is not ready — “See how it works”. Scrolls down rather than buying." },
      { kind: "text", key: "ctaNote", label: "Line under the button", hint: "The risk removed, in a few words. Only what is actually true of this offer." },
      { kind: "text", key: "audience", label: "Built for", hint: "Who it is for, separated by ·  — e.g. Coaches · Consultants · Course creators." },
      { kind: "text", key: "packageTitle", label: "Package card title", hint: "The small heading above the deliverables card — e.g. “What you get”." },
      { kind: "textarea", key: "packageNote", label: "Package card note", rows: 3, hint: "A closing line inside that card. Optional." },
      { kind: "list", key: "facts", label: "Facts card", item: [row("label", "Label"), row("value", "Value"), row("detail", "Detail", "textarea")], addLabel: "Add a fact" },
      { kind: "list", key: "stats", label: "Figures strip", hint: "Sits directly under the hero as a break. Only figures you can stand behind. Leave empty to hide.", item: [row("value", "Figure"), row("label", "Label")], addLabel: "Add a figure" },
      {
        kind: "richtext",
        key: "copy",
        label: "Copy",
        hint: "A block of writing for this section. Formatted, optional — leave it empty and nothing shows.",
      },
    ],
    // Prose defaults name the JOB of the field in the page's own voice, so an
    // unwritten hero reads as an unwritten hero. Everything that would state a
    // fact about the product — price, trial, platform, figures — ships empty.
    // These defaults are inherited by every new product and upsell page, and a
    // default that makes a claim is a claim nobody chose to make.
    defaults: {
      copy: "",
      prehead: "",
      headline: "The outcome they want, in one line.",
      subhead: "Why it is believable — what it is, and the mechanism behind it.",
      bullets: [],
      ctaLabel: "Get instant access",
      ctaSecondary: "",
      ctaNote: "",
      audience: "",
      packageTitle: "",
      packageNote: "",
      facts: [],
      stats: [],
    },
  },
  {
    key: "problem",
    n: "3",
    title: "Problem",
    purpose: "Name the pain, and put it outside their character rather than inside it.",
    shape: "Named traps as cards, their own words as chips, then a two-column reframe.",
    defaultStyle: "paper",
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      { kind: "text", key: "lead", label: "Lead line" },
      {
        kind: "list",
        key: "traps",
        label: "The traps",
        hint: "Two to four. Each is a situation they are stuck in — named, so they recognise themselves in one.",
        item: [row("title", "Name of the trap"), row("body", "What it looks like", "textarea")],
        addLabel: "Add a trap",
      },
      { kind: "list", key: "chips", label: "What they say", hint: "Their own words. Quote marks are added for you.", item: [row("text", "Line")], addLabel: "Add a line" },
      { kind: "textarea", key: "feels", label: "What it feels like", hint: "The story they tell themselves.", rows: 3 },
      { kind: "textarea", key: "truth", label: "What is actually true", hint: "The reframe. The problem is the situation, not them.", rows: 3 },
      {
        kind: "richtext",
        key: "copy",
        label: "Copy",
        hint: "A block of writing for this section. Formatted, optional — leave it empty and nothing shows.",
      },
    ],
    defaults: {
      copy: "",
      heading: "The problem, in their words.",
      lead: "",
      traps: [],
      chips: [],
      feels: "",
      truth: "",
    },
  },
  {
    key: "solution",
    n: "4",
    title: "Solution",
    purpose: "What we offer, and why it answers that problem.",
    shape: "Numbered steps for a sequence, or a question grid for the checks it runs.",
    defaultStyle: "sand",
    variants: [
      { key: "steps", label: "Numbered steps" },
      { key: "questions", label: "Question grid" },
    ],
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      { kind: "textarea", key: "lead", label: "Lead line", hint: "One sentence on what they do versus what the product does.", rows: 2 },
      {
        kind: "list",
        key: "steps",
        label: "Steps",
        hint: "Numbered steps read as a sequence; the question grid reads the title as a question and the body as the answer.",
        item: [row("title", "Title"), row("body", "Body", "textarea")],
        addLabel: "Add a step",
      },
      { kind: "textarea", key: "result", label: "Result line", rows: 2 },
      {
        kind: "richtext",
        key: "copy",
        label: "Copy",
        hint: "A block of writing for this section. Formatted, optional — leave it empty and nothing shows.",
      },
    ],
    defaults: {
      copy: "",
      heading: "How it works",
      lead: "",
      steps: [],
      result: "",
    },
  },
  {
    key: "benefits",
    n: "5",
    title: "Benefits",
    purpose: "Their week after buying. Outcomes, not features.",
    shape: "Weighted rows, or cards.",
    defaultStyle: "rose",
    variants: [
      { key: "rows", label: "Weighted rows" },
      { key: "cards", label: "Cards" },
    ],
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      { kind: "list", key: "items", label: "Outcomes", hint: "What is different for them afterwards. Not what the product contains — that is the section above.", item: [row("title", "Outcome"), row("body", "Detail", "textarea"), row("icon", "Icon (SVG or image URL)", "textarea")], addLabel: "Add an outcome" },
      {
        kind: "richtext",
        key: "copy",
        label: "Copy",
        hint: "A block of writing for this section. Formatted, optional — leave it empty and nothing shows.",
      },
    ],
    defaults: {
      copy: "",
      heading: "What you walk away with",
      items: [],
    },
  },
  {
    key: "offer",
    n: "6",
    title: "The Offer",
    purpose:
      "The deliverables, early. A low-ticket page earns the read by showing the package before it argues for it.",
    shape: "Numbered parts, then an optional value stack. The real price is added for you.",
    defaultStyle: "paper",
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      { kind: "list", key: "modules", label: "What is inside", hint: "One line per deliverable, in the order they will use them.", item: [row("title", "Name"), row("body", "What it does", "textarea")], addLabel: "Add a part" },
      { kind: "text", key: "note", label: "Line under the list", hint: "Optional. The one thing about the package worth saying in prose." },
      { kind: "list", key: "stack", label: "Value stack", hint: "Optional. Your claimed values — the “you pay” line comes from the real price.", item: [row("label", "Line"), row("amount", "Worth")], addLabel: "Add a line" },
      { kind: "text", key: "totalLabel", label: "Total row label" },
      { kind: "text", key: "totalAmount", label: "Total worth" },
      { kind: "text", key: "ctaLabel", label: "Button", hint: "The stack piles up everything they get right before the button — so there has to be one here." },
      { kind: "text", key: "ctaNote", label: "Line under the button" },
      {
        kind: "richtext",
        key: "copy",
        label: "Copy",
        hint: "A block of writing for this section. Formatted, optional — leave it empty and nothing shows.",
      },
    ],
    defaults: {
      copy: "",
      heading: "Everything you get",
      modules: [],
      note: "",
      // Amounts ship EMPTY on purpose. A value stack is a claim about what
      // something is worth, and a default figure is a claim nobody made — it
      // would go live the first time someone saved the page without reading it.
      stack: [],
      totalLabel: "Total value",
      totalAmount: "",
      ctaLabel: "",
      ctaNote: "",
    },
  },
  {
    key: "authority",
    n: "7",
    title: "Authority",
    purpose: "Why you specifically. The reason your experience makes this trustworthy.",
    shape: "Image beside copy, with credibility figures.",
    defaultStyle: "navy",
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      { kind: "textarea", key: "body", label: "Body", hint: "First person. The specific experience that makes the promise credible.", rows: 5 },
      { kind: "image", key: "imageUrl", label: "Image", hint: "Upload a file, or paste a URL if it is hosted elsewhere." },
      { kind: "list", key: "figures", label: "Figures", hint: "Only what you can stand behind, and only what you could evidence if asked.", item: [row("value", "Figure"), row("label", "Label")], addLabel: "Add a figure" },
      { kind: "text", key: "logosLabel", label: "Logos label", hint: "e.g. “Companies I have built for, or with”." },
      { kind: "list", key: "logos", label: "Logos", hint: "Only companies you actually worked with, and only where you may use the mark.", item: [row("name", "Name"), row("url", "Image URL")], addLabel: "Add a logo" },
      {
        kind: "richtext",
        key: "copy",
        label: "Copy",
        hint: "A block of writing for this section. Formatted, optional — leave it empty and nothing shows.",
      },
    ],
    // Figures ship empty. A credibility number is the single easiest thing to
    // inherit by accident and the single worst thing to publish unchecked.
    defaults: {
      copy: "",
      heading: "Why me",
      body: "",
      imageUrl: "",
      figures: [],
      logosLabel: "",
      logos: [],
    },
  },
  {
    key: "proof",
    n: "8",
    title: "Proof",
    purpose: "Evidence it works. Real quotes, or the mechanism itself until those exist.",
    shape: "One lead quote with two supporting, or the mechanism as proof.",
    defaultStyle: "sand",
    variants: [
      { key: "quotes", label: "Testimonials" },
      { key: "mechanism", label: "Mechanism as proof" },
    ],
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      {
        kind: "list",
        key: "quotes",
        label: "Testimonials",
        hint: "Only quotes you have permission to publish. Never invented names or results — a section with none is skipped entirely.",
        item: [row("quote", "Quote", "textarea"), row("name", "Name"), row("role", "Role")],
        addLabel: "Add a testimonial",
      },
      {
        kind: "list",
        key: "results",
        label: "Results",
        hint: "A case story: what it was, what it became, and over how long. Only outcomes you can evidence.",
        item: [row("title", "Who / what"), row("before", "Before"), row("after", "After"), row("detail", "Over what period", "textarea")],
        addLabel: "Add a result",
      },
      { kind: "list", key: "reasons", label: "Mechanism points", hint: "Used by the “mechanism as proof” layout — for when there are no testimonials yet.", item: [row("title", "Point"), row("body", "Detail", "textarea")], addLabel: "Add a point" },
      { kind: "text", key: "note", label: "Closing line" },
      {
        kind: "richtext",
        key: "copy",
        label: "Copy",
        hint: "A block of writing for this section. Formatted, optional — leave it empty and nothing shows.",
      },
    ],
    defaults: {
      copy: "",
      heading: "Proof it works",
      quotes: [],
      results: [],
      reasons: [],
      note: "",
    },
  },
  {
    key: "value",
    n: "9",
    title: "Value & price",
    purpose: "What the result is worth, then what it costs, then the risk removed.",
    shape: "Comparison columns, a price card, a guarantee, and the questions worth answering.",
    defaultStyle: "plum",
    variants: [
      { key: "compare", label: "Compare the alternatives" },
      { key: "card", label: "Price card only" },
      { key: "tiers", label: "Options side by side" },
    ],
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      {
        kind: "list",
        key: "worth",
        label: "What the result is worth",
        hint: "The other half of the definition — what one outcome is worth to them, not just what it would cost elsewhere. Only figures they would recognise.",
        item: [row("label", "The outcome"), row("amount", "Worth")],
        addLabel: "Add a line",
      },
      {
        kind: "list",
        key: "options",
        label: "What it would cost another way",
        hint: "What they would otherwise pay, and to whom. Yours goes last and is highlighted automatically.",
        item: [row("label", "Option"), row("amount", "Cost"), row("note", "Note")],
        addLabel: "Add an option",
      },
      { kind: "list", key: "checklist", label: "Included", hint: "Restated at the price, so the number lands against the list rather than alone.", item: [row("text", "Line")], addLabel: "Add a line" },
      { kind: "text", key: "priceNote", label: "Line under the price" },
      { kind: "text", key: "ctaLabel", label: "Button", hint: "This is where the price is revealed. A price with no way to act on it sends them looking for one." },
      { kind: "text", key: "ctaNote", label: "Line under the button" },
      { kind: "text", key: "priceEyebrow", label: "Price card eyebrow", hint: "e.g. “After trial”." },
      { kind: "text", key: "altPrice", label: "Second price", hint: "e.g. an annual option. Only if it really exists." },
      { kind: "text", key: "altPeriod", label: "Second price per" },
      { kind: "text", key: "priceBadge", label: "Price badge", hint: "e.g. “40% off”. Only if it is true." },
      { kind: "text", key: "secureNote", label: "Security line" },
      {
        kind: "richtext",
        key: "copy",
        label: "Copy",
        hint: "A block of writing for this section. Formatted, optional — leave it empty and nothing shows.",
      },
    ],
    // Everything here that could state a price, a trial, a refund window or a
    // guarantee ships empty. The only money on this page a buyer can trust is
    // the figure passed in from the real offer.
    defaults: {
      copy: "",
      heading: "What it costs",
      worth: [],
      options: [],
      checklist: [],
      priceNote: "",
      ctaLabel: "",
      ctaNote: "",
      priceEyebrow: "",
      altPrice: "",
      altPeriod: "",
      priceBadge: "",
      secureNote: "",
    },
  },
  {
    key: "guarantee",
    n: "9",
    title: "Guarantee",
    purpose: "The last move of part nine: remove the final piece of risk, on its own, where it cannot be skimmed past.",
    shape: "A single panel — the promise, then what it actually means.",
    defaultStyle: "cream",
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      { kind: "textarea", key: "body", label: "The guarantee", hint: "Only a guarantee you will actually honour. This one is enforceable against you.", rows: 4 },
      { kind: "list", key: "points", label: "What that means", hint: "The specifics — when they are charged, how they cancel, what they keep.", item: [row("text", "Line")], addLabel: "Add a line" },
      { kind: "text", key: "note", label: "Closing line" },
      {
        kind: "richtext",
        key: "copy",
        label: "Copy",
        hint: "A block of writing for this section. Formatted, optional — leave it empty and nothing shows.",
      },
    ],
    defaults: { copy: "", heading: "", body: "", points: [], note: "" },
  },
  {
    key: "faq",
    n: "+",
    title: "FAQ",
    purpose:
      "Not one of Ajit's ten parts — an addition, because an objection answered after the price has already cost you the sale.",
    shape: "Two columns of open questions. An accordion hides the answers, which is the opposite of the point.",
    defaultStyle: "paper",
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      {
        kind: "list",
        key: "faqs",
        label: "Questions",
        hint: "The objections worth answering before they decide. Leave empty to hide the section.",
        item: [row("q", "Question"), row("a", "Answer", "textarea")],
        addLabel: "Add a question",
      },
      {
        kind: "richtext",
        key: "copy",
        label: "Copy",
        hint: "A block of writing for this section. Formatted, optional — leave it empty and nothing shows.",
      },
    ],
    defaults: { copy: "", heading: "FAQ", faqs: [] },
  },
  {
    key: "cta",
    n: "10",
    title: "Call to action + warning",
    purpose: "One clear instruction, paired with the cost of doing nothing.",
    shape: "Split — the action against the cost of waiting.",
    defaultStyle: "sand",
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      { kind: "list", key: "checklist", label: "Checklist", hint: "The same lines as the hero. Repetition at the close is the point.", item: [row("text", "Line")], addLabel: "Add a line" },
      { kind: "text", key: "ctaLabel", label: "Button" },
      { kind: "text", key: "ctaNote", label: "Line under the button", hint: "The same risk-reversal as the hero, word for word." },
      { kind: "text", key: "warningTitle", label: "Warning title" },
      { kind: "textarea", key: "warningBody", label: "The cost of waiting", rows: 4 },
      {
        kind: "richtext",
        key: "copy",
        label: "Copy",
        hint: "A block of writing for this section. Formatted, optional — leave it empty and nothing shows.",
      },
    ],
    defaults: {
      copy: "",
      heading: "Do not leave this for another month.",
      checklist: [],
      ctaLabel: "Get instant access",
      ctaNote: "",
      warningTitle: "",
      warningBody: "",
    },
  },
  {
    key: "footer",
    n: "+",
    title: "Footer",
    purpose: "The legal close. Not persuasion — the lines a buyer needs to find after they have decided.",
    shape: "A rule, then the mark, the copyright and the links.",
    defaultStyle: "paper",
    fields: [
      { kind: "image", key: "logoUrl", label: "Mark", hint: "Optional." },
      { kind: "text", key: "note", label: "Copyright line" },
      { kind: "list", key: "links", label: "Links", hint: "Privacy, terms, refunds — whatever this store is required to show.", item: [row("label", "Label"), row("url", "URL")], addLabel: "Add a link" },
      {
        kind: "richtext",
        key: "copy",
        label: "Copy",
        hint: "A block of writing for this section. Formatted, optional — leave it empty and nothing shows.",
      },
    ],
    defaults: { copy: "", logoUrl: "", note: "", links: [] },
  },
];

/**
 * The storefront's bands.
 *
 * A separate list from SECTIONS, because a home page is not a sales letter:
 * "Problem" and "Guarantee" are the wrong questions to ask about a shop front,
 * and a store owner opening the home page should not have to skip past ten
 * sections that do not apply.
 *
 * No typed `fields` on any of them. Sales sections carry a form of named boxes
 * because those pages were typed before they were built; these are blocks from
 * the first day, so the band is a background and an on/off switch and the
 * content is whatever someone puts in it.
 *
 * Four bands rather than one, so the page can alternate grounds the way the
 * sales pages do, and rather than ten, so the list is a shape you can hold in
 * your head. Each is named for what it is for; none of them has to be used.
 */
export const HOME_SECTIONS: SectionDef[] = [
  {
    key: "welcome",
    n: "1",
    title: "Welcome",
    purpose: "What this store is, to someone who has just arrived and knows nothing about it.",
    shape: "Blocks. Usually a heading, a line under it, and a button.",
    defaultStyle: "cream",
    fields: [],
    defaults: {},
  },
  {
    key: "browse",
    n: "2",
    title: "Browse",
    purpose: "What is for sale. The catalogue block belongs here.",
    shape: "Blocks. The Catalogue block draws every published product.",
    defaultStyle: "paper",
    fields: [],
    defaults: {},
  },
  {
    key: "membership",
    n: "3",
    title: "Memberships",
    purpose: "The subscriptions, for a reader who wants more than one thing.",
    shape: "Blocks. The Memberships block draws every subscription offer.",
    defaultStyle: "cream",
    fields: [],
    defaults: {},
  },
  {
    key: "closing",
    n: "4",
    title: "Closing",
    purpose: "Anything after the shelves — a promise, a note, a last word.",
    shape: "Blocks.",
    defaultStyle: "sand",
    fields: [],
    defaults: {},
  },
];

export const SECTION_KEYS = SECTIONS.map((s) => s.key);
export const HOME_SECTION_KEYS = HOME_SECTIONS.map((s) => s.key);

// Both lists, because `sectionDef` is asked about a key by the editor, the
// clipboard and the save without any of them knowing which page it came from.
const BY_KEY = new Map([...SECTIONS, ...HOME_SECTIONS].map((s) => [s.key, s]));
export const sectionDef = (key: string): SectionDef | undefined => BY_KEY.get(key as SectionKey);

// ---------------------------------------------------------------------------
// Stored rows -> what a component renders
// ---------------------------------------------------------------------------

export type SectionRow = {
  sectionKey: string;
  position: number;
  enabled: boolean;
  style: string;
  accent: string | null;
  variant: string | null;
  content: unknown;
  /**
   * A picture or a wash over the band's colour. Null means the preset alone.
   *
   * The preset still decides the ink. That is what keeps the words readable
   * when an image is slow, fails, or turns out lighter than it looked.
   */
  background?: unknown;
  cssId?: string | null;
  cssClass?: string | null;
  /** How wide the band holds its content, and how much air. Null is built-in. */
  layout?: unknown;
  /**
   * When this row was last written, as the editor last read it.
   *
   * Sent back on save so the write can refuse to land on a row somebody else
   * has changed in the meantime. Absent for a section that has never been
   * stored — there is nothing to lose on its first save.
   */
  updatedAt?: string | null;
};

export type SectionView = {
  def: SectionDef;
  theme: BandTheme;
  variant: string;
  /** Field values, defaults filled in. */
  c: Record<string, unknown>;
  /**
   * What was actually stored, with no defaults merged in.
   *
   * The builder converts from THIS. A default is guidance, not content — a
   * section nobody has written should open as an empty canvas, not as a page
   * of placeholder prose someone then has to delete.
   */
  stored: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// How a band holds its content
// ---------------------------------------------------------------------------

/** The measure a band caps its content at, when it caps it at all. */
export const BAND_WIDTH = 1040;

/** The air a band has always had: 24px at the sides, 48 top and bottom (64 at md). */
export const BAND_PAD_X = 24;
export const BAND_PAD_Y = 48;
export const BAND_PAD_Y_MD = 64;

/**
 * How wide a band holds its content, and how much air it sits in.
 *
 * `boxed` is what every band did before this existed: capped at 1040px and
 * centred. `full` lets the content reach the screen edge, which is what a
 * design with a full-bleed ground actually needs — the alternative was a
 * negative margin on a block, and a negative margin is a trick that leaves an
 * unexplained number in the inspector.
 *
 * Every field is nullable and null means "as it always was", so a band nobody
 * has touched renders byte-identical CSS to the one it rendered yesterday.
 * That is the only safe way to add a layout knob to pages that are live.
 */
// Two answers, not three. "Custom" was a third mode whose only job was to
// reveal the measure field — which meant Boxed was a measure you could see and
// not change, and the difference between the two was a locked number. Boxed
// now HAS the measure, and blank means the built-in 1040.
export type SectionWidth = "boxed" | "full";

/** Every measure here can be absolute or relative. % is of the viewport. */
export type SectionUnit = "px" | "%";

/** What a value may be, so a typo cannot produce a 100343px band. */
export const SECTION_LIMITS = {
  maxWidth: { px: 2400, "%": 100 },
  pad: { px: 200, "%": 25 },
} as const;

/**
 * Padding, per side.
 *
 * One number for "the sides" and another for "top and bottom" covers the
 * common case and refuses the design that needs air above and none below —
 * which is exactly what a photograph standing on the band's edge is. Four
 * sides, each of which may be blank, and blank still means the built-in.
 */
export type SectionPad = {
  t: number | null;
  r: number | null;
  b: number | null;
  l: number | null;
};

export type SectionLayout = {
  width: SectionWidth;
  /** The measure a boxed band caps at. Null is the built-in 1040. */
  maxWidth: number | null;
  maxWidthUnit: SectionUnit;
  pad: SectionPad;
  padUnit: SectionUnit;
  /** Typing one side sets all four. Off is how the four come apart. */
  padLink: boolean;
};

export const defaultSectionLayout = (): SectionLayout => ({
  width: "boxed",
  maxWidth: null,
  maxWidthUnit: "px",
  pad: { t: null, r: null, b: null, l: null },
  padUnit: "px",
  padLink: true,
});

/** A measure with its unit, ready for a style declaration. */
export const sectionSize = (n: number | null, unit: SectionUnit): string | undefined =>
  n === null ? undefined : `${n}${unit}`;

export function normalizeSectionLayout(value: unknown): SectionLayout {
  const d = defaultSectionLayout();
  if (typeof value !== "object" || value === null || Array.isArray(value)) return d;
  const v = value as Record<string, unknown>;
  const unit = (x: unknown): SectionUnit => (x === "%" ? "%" : "px");
  const padRaw = (v.pad ?? {}) as Record<string, unknown>;
  // Nullable numbers stay null rather than falling back: null means "the
  // built-in", and 0 is a different, deliberate answer — a band with no air.
  //
  // Clamped, because these land in a style attribute and a slip of the
  // keyboard should not be able to make a band a hundred thousand pixels tall.
  // A typed 100343 became exactly that before this clamp existed.
  const num = (x: unknown, cap: number): number | null =>
    typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.min(x, cap) : null;
  const maxWidthUnit = unit(v.maxWidthUnit);
  // The unit was per-value for an afternoon; one unit for the four sides is
  // what a padding actually is, and `padXUnit` is read here so nothing stored
  // in between comes back blank.
  const padUnit = unit(v.padUnit ?? v.padXUnit ?? v.padYUnit);
  const cap = SECTION_LIMITS.pad[padUnit];
  // `custom` was a third width mode. Anything stored under it was a boxed band
  // with a measure, which is what boxed now is.
  const width: SectionWidth = v.width === "full" ? "full" : "boxed";
  const pad: SectionPad = {
    t: num(padRaw.t ?? v.padY, cap),
    r: num(padRaw.r ?? v.padX, cap),
    b: num(padRaw.b ?? v.padY, cap),
    l: num(padRaw.l ?? v.padX, cap),
  };
  return {
    width,
    maxWidth: num(v.maxWidth, SECTION_LIMITS.maxWidth[maxWidthUnit]),
    maxWidthUnit,
    pad,
    padUnit,
    // Linked unless the four are actually different, so opening a band someone
    // set per-side does not silently relink and flatten it on the next keypress.
    padLink:
      v.padLink === false
        ? false
        : pad.t === pad.r && pad.r === pad.b && pad.b === pad.l,
  };
}

/** True when a stored layout says nothing the built-in does not already say. */
export const layoutIsDefault = (l: SectionLayout): boolean =>
  l.width === "boxed" &&
  l.maxWidth === null &&
  l.pad.t === null &&
  l.pad.r === null &&
  l.pad.b === null &&
  l.pad.l === null;

/**
 * The band's box, as CSS — one answer for the page and for the builder canvas.
 *
 * Exported because the canvas was drawing its own box and ignoring this
 * entirely: the Width controls wrote values that the page honoured and the
 * builder did not, so setting a measure appeared to do nothing at all in the
 * one place you set it from. Two implementations of "how wide is this band" is
 * how that happens; there is now one.
 */
export function sectionBox(layout: unknown): { outer: React.CSSProperties; inner: React.CSSProperties } {
  const l = normalizeSectionLayout(layout);
  // Per side, and only the sides that were set — an unset side keeps whatever
  // the built-in put there, which is what "blank means the built-in" has to
  // mean once the four can differ.
  const outer: React.CSSProperties = {};
  if (l.pad.t !== null) outer.paddingTop = sectionSize(l.pad.t, l.padUnit);
  if (l.pad.r !== null) outer.paddingRight = sectionSize(l.pad.r, l.padUnit);
  if (l.pad.b !== null) outer.paddingBottom = sectionSize(l.pad.b, l.padUnit);
  if (l.pad.l !== null) outer.paddingLeft = sectionSize(l.pad.l, l.padUnit);
  const inner: React.CSSProperties =
    l.width === "full"
      ? {}
      : {
          maxWidth:
            l.maxWidth !== null ? sectionSize(l.maxWidth, l.maxWidthUnit) : `${BAND_WIDTH}px`,
          marginInline: "auto",
        };
  return { outer, inner };
}

/**
 * Turn a stored image value into something an `<img>` can use.
 *
 * Uploads store a bucket path; a pasted address stays a full URL. Accepting
 * both means switching to uploads did not invalidate anything already set.
 *
 * A leading slash is the third kind: a file this app ships from `/public`.
 * Built-in templates need it — their imagery is version controlled beside the
 * template that references it, and a bucket path would name an object that
 * exists in one store's bucket and nowhere else, so the same template file
 * would render a broken image on every other install. A stored bucket path
 * never begins with a slash, so nothing already saved changes meaning.
 */
export function imageSrc(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (v.startsWith("/")) return v;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/public-media/${v}`;
}

/** One list field, normalised to rows of plain strings. */
export function listOf(value: unknown, keys: string[]): Record<string, string>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const out: Record<string, string> = {};
      for (const k of keys) {
        const v = (item as Record<string, unknown>)?.[k];
        out[k] = typeof v === "string" ? v.trim() : "";
      }
      return out;
    })
    .filter((r) => Object.values(r).some(Boolean));
}

export function textOf(content: Record<string, unknown>, key: string): string {
  const v = content[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Build the render model for one stored section.
 *
 * Missing content falls back to the section's defaults rather than rendering
 * blank: this page is reached by buyers, and a half-configured section should
 * read as unfinished copy, not as an empty band.
 */
export function buildSectionView(row: SectionRow): SectionView | null {
  const def = sectionDef(row.sectionKey);
  if (!def || !row.enabled) return null;

  const stored = row.content && typeof row.content === "object" && !Array.isArray(row.content)
    ? (row.content as Record<string, unknown>)
    : {};
  const c: Record<string, unknown> = { ...def.defaults };
  for (const [k, v] of Object.entries(stored)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && !v.trim()) continue;
    c[k] = v;
  }

  return {
    def,
    theme: bandTheme(row.style, row.accent),
    variant: row.variant || def.variants?.[0]?.key || "default",
    c,
    stored,
  };
}


/** The rows a brand-new page starts with. */
export function defaultRows(list: SectionDef[] = SECTIONS): SectionRow[] {
  return list.map((def, i) => ({
    sectionKey: def.key,
    position: i,
    enabled: true,
    style: def.defaultStyle,
    accent: null,
    variant: def.variants?.[0]?.key ?? null,
    content: {},
  }));
}

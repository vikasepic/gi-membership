import { normalizeHex, readableInk, tint } from "@/lib/color";

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

export function bandTheme(styleKey: string | null | undefined, accentOverride?: string | null): BandTheme {
  const s = BAND_STYLES[(styleKey ?? "paper") as BandStyleKey] ?? BAND_STYLES.paper;
  const accent = normalizeHex(accentOverride, s.accent);
  return {
    bg: s.bg,
    fg: s.fg,
    accent,
    onAccent: readableInk(accent),
    panel: s.panel,
    panel2: s.panel2,
    rule: tint(s.fg, 0.14),
    muted: tint(s.fg, 0.72),
  };
}

// ---------------------------------------------------------------------------
// Field definitions — what the editor renders, and what a section stores
// ---------------------------------------------------------------------------

export type SubField = { key: string; label: string; kind: "text" | "textarea" };

export type FieldDef =
  | { kind: "text"; key: string; label: string; hint?: string }
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
  | "cta";

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
      "The pre-head names who this is for; the headline is the single most wanted outcome; the sub-head makes it believable.",
    shape: "Asymmetric — copy left, a facts card right, then an optional figures strip.",
    defaultStyle: "navy",
    fields: [
      { kind: "textarea", key: "prehead", label: "Pre-head", hint: "Who this is for. The wrong reader should leave here.", rows: 2 },
      { kind: "textarea", key: "headline", label: "Headline", rows: 2 },
      { kind: "textarea", key: "subhead", label: "Sub-headline", hint: "Backs the promise and hints at the mechanism.", rows: 3 },
      { kind: "text", key: "ctaLabel", label: "Button" },
      { kind: "text", key: "ctaNote", label: "Line under the button" },
      { kind: "list", key: "facts", label: "Facts card", item: [row("label", "Label"), row("value", "Value"), row("detail", "Detail", "textarea")], addLabel: "Add a fact" },
      { kind: "list", key: "stats", label: "Figures strip", hint: "Sits directly under the hero as a break. Leave empty to hide.", item: [row("value", "Figure"), row("label", "Label")], addLabel: "Add a figure" },
    ],
    defaults: {
      prehead: "For the coach, consultant or creator who has been meaning to post consistently for longer than they would like to admit.",
      headline: "Go from “I’ll be consistent someday” to “here’s this week’s content”",
      subhead: "A guided system that studies what is already working in your niche, pulls out the hooks behind it, and drafts your carousels, reels and posts in your own voice.",
      ctaLabel: "Start free for 7 days",
      ctaNote: "No card charged today · cancel any time",
      facts: [
        { label: "What you get", value: "Carousels, reels + posts", detail: "Drafted in your voice for Instagram and LinkedIn." },
        { label: "Time to start", value: "One afternoon", detail: "Add a few competitors and your drafts are waiting." },
        { label: "Investment", value: "$47 / month", detail: "Seven days free. No contract." },
      ],
      stats: [
        { value: "2", label: "Platforms" },
        { value: "3", label: "Formats" },
        { value: "7 days", label: "Free trial" },
        { value: "$47", label: "Per month" },
      ],
    },
  },
  {
    key: "problem",
    n: "3",
    title: "Problem",
    purpose: "Name the pain, and put it outside their character rather than inside it.",
    shape: "Their own words as chips, then a two-column reframe.",
    defaultStyle: "paper",
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      { kind: "text", key: "lead", label: "Lead line" },
      { kind: "list", key: "chips", label: "What they say", hint: "Quote marks are added for you.", item: [row("text", "Line")], addLabel: "Add a line" },
      { kind: "textarea", key: "feels", label: "What it feels like", hint: "The story they tell themselves.", rows: 3 },
      { kind: "textarea", key: "truth", label: "What is actually true", hint: "The reframe. The problem is the situation, not them.", rows: 3 },
    ],
    defaults: {
      heading: "You already know you should be posting more consistently.",
      lead: "Here is what I hear every week.",
      chips: [
        { text: "I know I should post, I just never know what to say." },
        { text: "I open the app, stare at it, and close it again." },
        { text: "I’ve been meaning to be consistent for months." },
      ],
      feels: "“I’m not disciplined enough to keep this up.”",
      truth: "Nobody gave you a repeatable way to turn what is already in your head into posts.",
    },
  },
  {
    key: "solution",
    n: "4",
    title: "Solution",
    purpose: "What we offer, and why it answers that problem.",
    shape: "Numbered steps — a real sequence, so the numbers carry meaning.",
    defaultStyle: "sand",
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      { kind: "list", key: "steps", label: "Steps", item: [row("title", "Title"), row("body", "Body", "textarea")], addLabel: "Add a step" },
      { kind: "textarea", key: "result", label: "Result line", rows: 2 },
    ],
    defaults: {
      heading: "Start from a draft, never from a blank page.",
      steps: [
        { title: "It studies your niche", body: "Reads the top posts and reels already performing where you compete." },
        { title: "It pulls out the hooks", body: "Breaks down why each one travelled, so you start from a proven angle." },
        { title: "It drafts in your voice", body: "Carousels, reels and posts you edit and publish — not generic captions." },
      ],
      result: "The result: a week of content ready to edit, in an afternoon rather than a weekend.",
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
      { kind: "list", key: "items", label: "Outcomes", item: [row("title", "Outcome"), row("body", "Detail", "textarea")], addLabel: "Add an outcome" },
    ],
    defaults: {
      heading: "What changes once you post consistently",
      items: [
        { title: "You become the name people think of", body: "Show up every week with something worth reading and you stop being one option among many." },
        { title: "You stop starting from zero", body: "Your best hooks and angles live in one place, ready to reuse and build on." },
        { title: "Your ideas become a body of work", body: "What is currently in your head turns into a searchable library that is yours." },
      ],
    },
  },
  {
    key: "offer",
    n: "6",
    title: "The Offer",
    purpose: "What it is, part by part, then the stack — so it reads as a lot for a little.",
    shape: "Module cards, then an itemised value table. The real price is added for you.",
    defaultStyle: "paper",
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      { kind: "list", key: "modules", label: "What is inside", item: [row("title", "Name"), row("body", "What it does", "textarea")], addLabel: "Add a part" },
      { kind: "list", key: "stack", label: "Value stack", hint: "Your claimed values. The “you pay” line comes from the real price.", item: [row("label", "Line"), row("amount", "Worth")], addLabel: "Add a line" },
      { kind: "text", key: "totalLabel", label: "Total row label" },
      { kind: "text", key: "totalAmount", label: "Total worth" },
    ],
    defaults: {
      heading: "Here is exactly what you get",
      modules: [
        { title: "Niche research", body: "The top posts in your space and the hook behind each one." },
        { title: "Drafting in your voice", body: "Carousels, reels and posts, ready to edit." },
        { title: "The weekly planner", body: "One place to move each piece from draft to posted." },
      ],
      stack: [
        { label: "Niche research, done continuously", amount: "$400/mo" },
        { label: "Drafts in your voice, every week", amount: "$800/mo" },
        { label: "Planning and publishing in one place", amount: "$200/mo" },
      ],
      totalLabel: "Total value",
      totalAmount: "$1,400/mo",
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
      { kind: "textarea", key: "body", label: "Body", rows: 5 },
      { kind: "text", key: "imageUrl", label: "Image URL", hint: "Leave empty for a placeholder panel." },
      { kind: "list", key: "figures", label: "Figures", hint: "Only what you can stand behind.", item: [row("value", "Figure"), row("label", "Label")], addLabel: "Add a figure" },
    ],
    defaults: {
      heading: "Built by people who study what actually performs",
      body: "Greater Inside spends its days on one question: why does one post travel and a nearly identical one does not. Content Engine does what a good researcher does — reads the top posts, transcribes the reels, and breaks down the hook behind each one.",
      imageUrl: "",
      figures: [
        { value: "Daily", label: "Niche research runs" },
        { value: "2", label: "Platforms covered" },
        { value: "100%", label: "Yours to keep" },
      ],
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
      { kind: "list", key: "reasons", label: "Mechanism points", hint: "Used by the “mechanism as proof” layout.", item: [row("title", "Point"), row("body", "Detail", "textarea")], addLabel: "Add a point" },
      { kind: "text", key: "note", label: "Closing line" },
    ],
    defaults: {
      heading: "Proof it works",
      quotes: [],
      reasons: [
        { title: "It reads what already won", body: "Only posts that actually performed in your niche, not guesses." },
        { title: "It names the hook", body: "The specific reason each one travelled, written down." },
        { title: "You approve every word", body: "Nothing publishes without you. The voice stays yours." },
      ],
      note: "Until there are reviews worth quoting, the mechanism is the proof — and it is true today.",
    },
  },
  {
    key: "value",
    n: "9",
    title: "Value, price, guarantee",
    purpose: "What the result is worth, then what it costs, then the risk removed.",
    shape: "Comparison columns, a price card, and a guarantee.",
    defaultStyle: "plum",
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      {
        kind: "list",
        key: "options",
        label: "What it replaces",
        hint: "Yours goes last and is highlighted automatically.",
        item: [row("label", "Option"), row("amount", "Cost"), row("note", "Note")],
        addLabel: "Add an option",
      },
      { kind: "text", key: "priceNote", label: "Line under the price" },
      { kind: "text", key: "guaranteeTitle", label: "Guarantee title" },
      { kind: "textarea", key: "guaranteeBody", label: "Guarantee", rows: 3 },
    ],
    defaults: {
      heading: "What staying consistent actually costs",
      options: [
        { label: "Content agency", amount: "$2–5k", note: "per month, ongoing" },
        { label: "In-house hire", amount: "A salary", note: "months to ramp" },
        { label: "Doing it yourself", amount: "Your time", note: "hours every week" },
        { label: "Content Engine", amount: "$47", note: "per month" },
      ],
      priceNote: "Seven days free. Cancel from your account in one click.",
      guaranteeTitle: "Nothing today",
      guaranteeBody: "Your card is not charged until day eight. Cancel before then and you pay nothing at all.",
    },
  },
  {
    key: "cta",
    n: "10",
    title: "Call to action + warning",
    purpose: "One clear instruction, paired with the cost of doing nothing.",
    shape: "Split — the action against the cost of waiting.",
    defaultStyle: "paper",
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      { kind: "list", key: "checklist", label: "Checklist", item: [row("text", "Line")], addLabel: "Add a line" },
      { kind: "text", key: "ctaLabel", label: "Button" },
      { kind: "text", key: "warningTitle", label: "Warning title" },
      { kind: "textarea", key: "warningBody", label: "The cost of waiting", rows: 4 },
    ],
    defaults: {
      heading: "One login. One afternoon. A week of content.",
      checklist: [
        { text: "The research done for you" },
        { text: "Drafts in your own voice" },
        { text: "One place to plan and publish" },
      ],
      ctaLabel: "Start free for 7 days",
      warningTitle: "And if you close this tab?",
      warningBody:
        "Later becomes next week, and next week becomes next month. A year from now someone with the same expertise has the audience you wanted — not because they were better, but because they kept publishing and you did not.",
    },
  },
];

export const SECTION_KEYS = SECTIONS.map((s) => s.key);
const BY_KEY = new Map(SECTIONS.map((s) => [s.key, s]));
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
};

export type SectionView = {
  def: SectionDef;
  theme: BandTheme;
  variant: string;
  /** Field values, defaults filled in. */
  c: Record<string, unknown>;
};

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
  };
}

/** The rows a brand-new page starts with. */
export function defaultRows(): SectionRow[] {
  return SECTIONS.map((def, i) => ({
    sectionKey: def.key,
    position: i,
    enabled: true,
    style: def.defaultStyle,
    accent: null,
    variant: def.variants?.[0]?.key ?? null,
    content: {},
  }));
}

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
    n: "1",
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
      facts: [],
      stats: [],
    },
  },
  {
    key: "offer",
    n: "2",
    title: "What you get",
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
    title: "How it works",
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
    title: "What you walk away with",
    purpose: "Their week after buying. Outcomes, not features.",
    shape: "Weighted rows, or cards.",
    defaultStyle: "rose",
    variants: [
      { key: "rows", label: "Weighted rows" },
      { key: "cards", label: "Cards" },
    ],
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      { kind: "list", key: "items", label: "Outcomes", hint: "What is different for them afterwards. Not what the product contains — that is the section above.", item: [row("title", "Outcome"), row("body", "Detail", "textarea")], addLabel: "Add an outcome" },
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
    key: "authority",
    n: "6",
    title: "Authority",
    purpose: "Why you specifically. The reason your experience makes this trustworthy.",
    shape: "Image beside copy, with credibility figures.",
    defaultStyle: "navy",
    fields: [
      { kind: "textarea", key: "heading", label: "Heading", rows: 2 },
      { kind: "textarea", key: "body", label: "Body", hint: "First person. The specific experience that makes the promise credible.", rows: 5 },
      { kind: "image", key: "imageUrl", label: "Image", hint: "Upload a file, or paste a URL if it is hosted elsewhere." },
      { kind: "list", key: "figures", label: "Figures", hint: "Only what you can stand behind, and only what you could evidence if asked.", item: [row("value", "Figure"), row("label", "Label")], addLabel: "Add a figure" },
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
    },
  },
  {
    key: "proof",
    n: "7",
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
      reasons: [],
      note: "",
    },
  },
  {
    key: "value",
    n: "8",
    title: "Value, price, guarantee",
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
        key: "options",
        label: "What it replaces",
        hint: "What they would otherwise pay, and to whom. Yours goes last and is highlighted automatically.",
        item: [row("label", "Option"), row("amount", "Cost"), row("note", "Note")],
        addLabel: "Add an option",
      },
      { kind: "list", key: "checklist", label: "Included", hint: "Restated at the price, so the number lands against the list rather than alone.", item: [row("text", "Line")], addLabel: "Add a line" },
      { kind: "text", key: "priceNote", label: "Line under the price" },
      { kind: "text", key: "guaranteeTitle", label: "Guarantee title" },
      { kind: "textarea", key: "guaranteeBody", label: "Guarantee", hint: "Only a guarantee you will actually honour. This one is enforceable against you.", rows: 3 },
      {
        kind: "list",
        key: "faqs",
        label: "Questions",
        hint: "The objections worth answering before the price lands. Leave empty to hide.",
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
    // Everything here that could state a price, a trial, a refund window or a
    // guarantee ships empty. The only money on this page a buyer can trust is
    // the figure passed in from the real offer.
    defaults: {
      copy: "",
      heading: "What it costs",
      options: [],
      checklist: [],
      priceNote: "",
      guaranteeTitle: "",
      guaranteeBody: "",
      faqs: [],
    },
  },
  {
    key: "cta",
    n: "9",
    title: "Call to action + warning",
    purpose: "One clear instruction, paired with the cost of doing nothing.",
    shape: "Split — the action against the cost of waiting.",
    defaultStyle: "paper",
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

/**
 * Turn a stored image value into something an `<img>` can use.
 *
 * Uploads store a bucket path; a pasted address stays a full URL. Accepting
 * both means switching to uploads did not invalidate anything already set.
 */
export function imageSrc(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return v;
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
  };
}

/**
 * True when a section has nothing but its heading.
 *
 * This is the other half of taking the claims out of the defaults. A default
 * used to be a paragraph of somebody's sales letter, so an unwritten section
 * still filled a band; now it falls back to a heading and nothing else, and
 * publishing that gives a buyer a band reading "Proof it works" that proves
 * nothing. An unwritten section should be absent, not empty.
 *
 * The heading is excluded because every section has one by default, and a
 * button label is excluded because a button is not an argument — though the
 * closing CTA is exempt from this check entirely, since there the button IS
 * the section.
 */
export function isSectionEmpty(view: SectionView): boolean {
  const notContent = new Set(["heading", "ctaLabel", "totalLabel"]);
  for (const f of view.def.fields) {
    if (notContent.has(f.key)) continue;
    const v = view.c[f.key];
    if (Array.isArray(v)) {
      if (listOf(v, f.kind === "list" ? f.item.map((i) => i.key) : []).length > 0) return false;
      continue;
    }
    if (typeof v !== "string") continue;
    // Strip tags first: an empty rich-text editor still stores "<p></p>".
    const text = f.kind === "richtext" ? v.replace(/<[^>]*>/g, "") : v;
    if (text.trim()) return false;
  }
  return true;
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

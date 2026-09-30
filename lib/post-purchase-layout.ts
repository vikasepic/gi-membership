import { z } from "zod";

/**
 * The shape of a post-purchase email, shared by the editor, the renderer and
 * the save. Pure and client-safe: the admin preview renders with it too.
 * Spec: docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md
 */

/**
 * Only fonts every inbox already has. Gmail and Outlook drop web fonts, so a
 * face offered here that is not installed on the reader's machine is a face
 * the owner sees and the buyer never does.
 */
export const EMAIL_FONTS = [
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
] as const;
const FONT_VALUES = EMAIL_FONTS.map((f) => f.value) as [string, ...string[]];
export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const layoutSchema = z.object({
  desktopWidth: z.number().int().min(320).max(900).default(600),
  mobileWidthPct: z.number().int().min(60).max(100).default(100),
  desktopPadding: z.number().int().min(0).max(64).default(32),
  mobilePadding: z.number().int().min(0).max(48).default(20),
  fontFamily: z.enum(FONT_VALUES).default("Arial, Helvetica, sans-serif"),
  fontSize: z.number().int().min(12).max(22).default(16),
  lineHeight: z.number().min(1.2).max(2).default(1.6),
  textColor: hex.default("#1a1a1a"),
  linkColor: hex.default("#c8653d"),
  bodyColor: hex.default("#ffffff"),
  backgroundColor: hex.default("#f1efe9"),
});
export type EmailLayout = z.infer<typeof layoutSchema>;
export const LAYOUT_DEFAULTS: EmailLayout = layoutSchema.parse({});

/** A stored layout that no longer parses is replaced whole, never half-applied. */
export function parseLayout(v: unknown): EmailLayout {
  const r = layoutSchema.safeParse(v ?? {});
  return r.success ? r.data : LAYOUT_DEFAULTS;
}

export const MERGE_KEYS = ["first_name", "offer_name", "access_link"] as const;
export type MergeKey = (typeof MERGE_KEYS)[number];
export type MergeVars = Partial<Record<MergeKey, string>>;
export const MERGE_LABELS: Record<MergeKey, string> = {
  first_name: "First name",
  offer_name: "What they bought",
  access_link: "Access link",
};

const isKey = (k: string): k is MergeKey => (MERGE_KEYS as readonly string[]).includes(k);

export function fillTags(s: string, vars: MergeVars): string {
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (isKey(k) ? (vars[k] ?? "") : ""));
}

/**
 * A subject or preview line, filled and tidied. A buyer with no name on file
 * must not get ", your Funnel App is ready". Only a line that opened with a
 * tag is capitalised: what the owner typed ("iPhone setup") stays as typed.
 */
export function fillLine(s: string, vars: MergeVars): string {
  const out = fillTags(s, vars)
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/^[\s,.!?;:]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return /^\s*\{\{/.test(s) ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

export const DELAY_UNITS = ["hours", "days"] as const;
export type DelayUnit = (typeof DELAY_UNITS)[number];
export function delayMs(amount: number, unit: DelayUnit): number {
  return Math.max(0, amount) * (unit === "hours" ? 3_600_000 : 86_400_000);
}

/** TipTap's JSON, as much of it as the renderer reads. */
export type DocMark = { type: string; attrs?: Record<string, unknown> };
export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
};
/** Shallow on purpose: the renderer ignores what it does not know, and escapes all text. */
export const docSchema = z.custom<DocNode>(
  (v) => !!v && typeof v === "object" && (v as DocNode).type === "doc" && Array.isArray((v as DocNode).content) && (v as DocNode).content!.length <= 500,
  { message: "not an email document" },
);

/** What a new email starts as, so turning a sequence on never shows a blank page. */
export function starterDoc(name: string): DocNode {
  const t = (text: string, marks?: DocMark[]): DocNode => ({ type: "text", text, ...(marks ? { marks } : {}) });
  return {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1, textAlign: null }, content: [t("Hi "), { type: "mergeTag", attrs: { key: "first_name" } }, t(", you're in.")] },
      { type: "paragraph", attrs: { textAlign: null }, content: [t("Thank you for getting "), t(name, [{ type: "bold" }]), t(". Everything is ready in your library.")] },
      { type: "emailButton", attrs: { label: "Open your library", href: "{{access_link}}", color: "#c8653d", align: "left" } },
      { type: "paragraph", attrs: { textAlign: null }, content: [t("In love and service,"), { type: "hardBreak" }, t("Ajit")] },
    ],
  };
}

/** Every link, button and image address in a document. */
export function docUrls(doc: DocNode): string[] {
  const out: string[] = [];
  const walk = (n: DocNode) => {
    for (const m of n.marks ?? []) if (m.type === "link" && typeof m.attrs?.href === "string") out.push(m.attrs.href);
    if (n.type === "emailButton" && typeof n.attrs?.href === "string") out.push(n.attrs.href);
    if (n.type === "image") {
      if (typeof n.attrs?.src === "string") out.push(n.attrs.src);
      if (typeof n.attrs?.href === "string" && n.attrs.href) out.push(n.attrs.href);
    }
    for (const c of n.content ?? []) walk(c);
  };
  walk(doc);
  return out;
}

/** Why an address cannot go in an email, in words the owner can act on. */
export function urlProblem(u: string): string | null {
  const t = u.trim();
  if (t === "{{access_link}}") return null;
  if (t.startsWith("data:")) return "an image was pasted in; upload it with the image button instead";
  try {
    return new URL(t).protocol === "https:" ? null : `${t} must start with https://`;
  } catch {
    return `${t} is not a web address`;
  }
}

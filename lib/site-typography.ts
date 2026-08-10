import { z } from "zod";
import { DEVICE_MAX } from "@/lib/blocks";
import { normalizeHex } from "@/lib/color";

/**
 * Typography for the whole site, as data and as CSS.
 *
 * A block's typography answers "what does THIS heading look like". This answers
 * "what does a heading look like here", which is the question every page asked
 * and nothing could answer: the only way to set a body size was to set it on
 * every text block, one block at a time, forever.
 *
 * Two rules make the two layers coexist:
 *
 *  1. **Unset emits nothing.** Every field is a string and empty means inherit.
 *     A declaration with an empty value is a broken rule, and a rule that
 *     emits a default anyway is a rule that overwrites what the app already
 *     renders. A store that sets nothing must ship no bytes and no change.
 *  2. **`:root h1` is 0-1-1.** That beats the `.font-display` (0-1-0) the
 *     heading block hardcodes and the `[&_p]:mb-3` utilities on rich text,
 *     which live in `@layer utilities` and lose to anything unlayered. It
 *     loses to `.bk-<id>.bk-<id>` (0-2-0), which is the point: a value typed
 *     into the block panel beats a default typed into Settings.
 *
 * No database client here, and no import of `lib/fonts` — that module is
 * `server-only`, and the settings form that will edit this runs in the browser.
 * The family sanitiser is therefore a copy of `safeFamily`, the same copy
 * `normalizeStyle` in lib/blocks.ts already keeps for the same reason.
 */

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

/**
 * What can be styled.
 *
 * Elements, not classes: these are the tags a page is actually built from, so
 * a rule reaches the heading block, the rich text inside it, the library, the
 * checkout and anything written next year without being told about them.
 * `linkHover` is here because a link colour with no hover colour is a link
 * that stops responding the moment somebody sets it.
 */
export const TYPOGRAPHY_ELEMENTS = [
  "body",
  "link",
  "linkHover",
  "list",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
] as const;
export type TypographyElement = (typeof TYPOGRAPHY_ELEMENTS)[number];

/** Values a select offers. Exported so the form and the schema cannot drift. */
export const TYPOGRAPHY_WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"] as const;
export const TYPOGRAPHY_STYLES = ["normal", "italic"] as const;
export const TYPOGRAPHY_TRANSFORMS = ["none", "uppercase", "lowercase", "capitalize"] as const;
export const TYPOGRAPHY_DECORATIONS = ["none", "underline", "line-through"] as const;

/** The four measurements that legitimately differ between a laptop and a phone. */
export type TypographyMetrics = {
  /** px, em or rem. */
  size: string;
  /** Unitless, em or px. Unitless is the one that survives a font-size change. */
  lineHeight: string;
  /** px or em, negative allowed — tightening is the common case. */
  letterSpacing: string;
  /** px or em. */
  wordSpacing: string;
  /** Body only: the gap between paragraphs, written onto `p`. */
  paragraphSpacing: string;
};

/** Everything that is true of an element at every width, plus the three widths. */
export type TypographyStyle = {
  family: string;
  weight: string;
  style: string;
  transform: string;
  decoration: string;
  color: string;
  desktop: TypographyMetrics;
  tablet: TypographyMetrics;
  mobile: TypographyMetrics;
};

export type SiteTypography = Record<TypographyElement, TypographyStyle>;

// ---------------------------------------------------------------------------
// The schema
// ---------------------------------------------------------------------------

// Anything not matching becomes "", which means inherit. Rejecting loudly would
// mean one bad character in a jsonb blob takes the whole store's typography —
// and every one of these strings is written straight into a stylesheet, so the
// allow-list is the sanitiser as well as the validator.
const SIZE = /^(\d*\.?\d+(px|em|rem))?$/;
const LINE = /^(\d*\.?\d+(px|em)?)?$/;
const SPACE = /^(-?\d*\.?\d+(px|em))?$/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A field that is a CSS token or nothing at all. Never throws. */
const cleaned = (clean: (raw: string) => string) =>
  z.unknown().optional().transform((v) => clean(typeof v === "string" ? v.trim() : ""));

const matching = (re: RegExp) => cleaned((raw) => (re.test(raw.toLowerCase()) ? raw.toLowerCase() : ""));
const oneOf = (values: readonly string[]) =>
  cleaned((raw) => (values.includes(raw.toLowerCase()) ? raw.toLowerCase() : ""));

/** A nested object that is allowed to be missing, which is the usual case. */
const nested = <T extends z.ZodType>(schema: T) =>
  z.unknown().optional().transform((v) => schema.parse(isRecord(v) ? v : {}));

const metricsSchema = z.object({
  size: matching(SIZE),
  lineHeight: matching(LINE),
  letterSpacing: matching(SPACE),
  wordSpacing: matching(SPACE),
  paragraphSpacing: matching(SIZE),
});

const styleSchema = z.object({
  // The same allow-list `safeFamily` uses: this ends up inside font-family: "…",
  // where a quote or a brace would close the declaration and open a new rule.
  family: cleaned((raw) => raw.replace(/[^A-Za-z0-9 \-]/g, "").trim().slice(0, 60)),
  weight: oneOf(TYPOGRAPHY_WEIGHTS),
  style: oneOf(TYPOGRAPHY_STYLES),
  transform: oneOf(TYPOGRAPHY_TRANSFORMS),
  decoration: oneOf(TYPOGRAPHY_DECORATIONS),
  color: cleaned((raw) => (raw ? normalizeHex(raw, "") : "")),
  desktop: nested(metricsSchema),
  tablet: nested(metricsSchema),
  mobile: nested(metricsSchema),
});

/**
 * Total, not strict. Parses `{}`, `null`, last year's shape and its own output
 * back to the same thing, because it is read from jsonb on every page render
 * and a page that throws is worse than a page with default type.
 */
export const SITE_TYPOGRAPHY_SCHEMA: z.ZodType<SiteTypography, unknown> = z
  .unknown()
  .transform((v) => {
    const raw = isRecord(v) ? v : {};
    const out = {} as SiteTypography;
    for (const el of TYPOGRAPHY_ELEMENTS) {
      out[el] = styleSchema.parse(isRecord(raw[el]) ? raw[el] : {}) as TypographyStyle;
    }
    return out;
  });

export function normalizeSiteTypography(value: unknown): SiteTypography {
  return SITE_TYPOGRAPHY_SCHEMA.parse(value);
}

/** Everything empty: what a store that has never opened the panel renders with. */
export const SITE_TYPOGRAPHY_DEFAULTS: SiteTypography = normalizeSiteTypography({});

// ---------------------------------------------------------------------------
// The CSS writer
// ---------------------------------------------------------------------------

const SELECTOR: Record<TypographyElement, string> = {
  body: ":root body",
  link: ":root a",
  linkHover: ":root a:hover",
  // Both list kinds, because "list" is one control in the panel and two rules
  // here; each half is 0-1-1 on its own.
  list: ":root ul, :root ol",
  blockquote: ":root blockquote",
  h1: ":root h1",
  h2: ":root h2",
  h3: ":root h3",
  h4: ":root h4",
  h5: ":root h5",
  h6: ":root h6",
};

/**
 * Paragraph spacing is the one body measurement that cannot go on `body`.
 * `margin-bottom` does not inherit, so it has to name the element it applies
 * to — and naming `p` is also what puts it above the `[&_p]:mb-3` utility the
 * rich-text block hardcodes.
 */
const PARAGRAPH_SELECTOR = ":root p";

const isHeading = (el: TypographyElement) => /^h[1-6]$/.test(el);

/**
 * The family, then the site's own font, then the system's.
 *
 * A named family that fails to load should fall back to what the store already
 * chose in Brand, not all the way to system-ui — those two variables are what
 * every existing rule reads, so they are the right middle rung.
 */
function familyValue(family: string, heading: boolean): string {
  const base = heading ? "var(--font-heading)" : "var(--font-body)";
  return `"${family}", ${base}, system-ui, sans-serif`;
}

function rulesAt(t: SiteTypography, device: "desktop" | "tablet" | "mobile"): string[] {
  const rules: string[] = [];
  for (const el of TYPOGRAPHY_ELEMENTS) {
    const e = t[el];
    const d: string[] = [];
    // The single-value half is not per device, so it belongs to the unscoped
    // rule alone. Repeating it inside a media query would restate a value
    // nothing had changed.
    if (device === "desktop") {
      if (e.family) d.push(`font-family:${familyValue(e.family, isHeading(el))}`);
      if (e.weight) d.push(`font-weight:${e.weight}`);
      if (e.style) d.push(`font-style:${e.style}`);
      if (e.transform) d.push(`text-transform:${e.transform}`);
      if (e.decoration) d.push(`text-decoration:${e.decoration}`);
      if (e.color) d.push(`color:${e.color}`);
    }
    const m = e[device];
    if (m.size) d.push(`font-size:${m.size}`);
    if (m.lineHeight) d.push(`line-height:${m.lineHeight}`);
    if (m.letterSpacing) d.push(`letter-spacing:${m.letterSpacing}`);
    if (m.wordSpacing) d.push(`word-spacing:${m.wordSpacing}`);
    if (d.length > 0) rules.push(`${SELECTOR[el]}{${d.join(";")}}`);
    // ponytail: paragraphSpacing rides in every element's metrics because one
    // shape is cheaper than two, and is read for body only.
    if (el === "body" && m.paragraphSpacing) {
      rules.push(`${PARAGRAPH_SELECTOR}{margin-bottom:${m.paragraphSpacing}}`);
    }
  }
  return rules;
}

/**
 * The stylesheet, or "" when nothing has been set.
 *
 * No diffing against the width above, unlike `blockRules`: a narrower width
 * that sets nothing simply keeps matching the unscoped rule, so there is
 * nothing to undo and nothing to `revert` — which matters, because `revert`
 * rolls back the whole author origin and would discard these rules too.
 *
 * Tablet before mobile, at the same two widths the block editor uses, so a
 * phone inherits the tablet value the way it does everywhere else.
 */
export function siteTypographyCss(t: SiteTypography): string {
  const out = rulesAt(t, "desktop");
  for (const device of ["tablet", "mobile"] as const) {
    const inner = rulesAt(t, device).join("");
    if (inner) out.push(`@media (max-width:${DEVICE_MAX[device]}px){${inner}}`);
  }
  return out.join("");
}

// ---------------------------------------------------------------------------
// Band ink
// ---------------------------------------------------------------------------

/**
 * The ink Paper, Cream and Sand share.
 *
 * Hardcoded rather than imported: `lib/page-sections` reads this module, so
 * reading BAND_STYLES back would be a cycle. A test asserts the three bands
 * still agree with it, which is the part that could actually drift.
 */
export const LIGHT_BAND_INK = "#16181f";

/**
 * The text colour a band should paint, given the site's own.
 *
 * A sales page has to respond to a body colour set in Settings, or the setting
 * looks broken on the pages people care most about. But the dark bands cannot:
 * Navy and Plum choose a pale ink *because* their ground is dark, and Rose has
 * its own warm near-black. Overriding those is how a band becomes unreadable,
 * which is the one thing the band presets exist to prevent.
 *
 * So only the shared light ink gives way. Anything else is a deliberate choice
 * made against a specific ground and is left exactly as it is.
 */
export function bandInk(bandFg: string, siteColor: string | null | undefined): string {
  if (bandFg !== LIGHT_BAND_INK || !siteColor) return bandFg;
  return normalizeHex(siteColor, bandFg);
}

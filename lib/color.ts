// Colour helpers shared by anything an admin can recolour.
//
// Extracted from lib/bump.ts when the sales page needed the same guarantees.
// One implementation, because the interesting part is not the maths — it is
// that the AA guarantee is total, and two copies of "total" drift.

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A reference to one of the store's global colours: `var(--gc-<id>, #hex)`.
 *
 * The shape lives here rather than with the palette because everything in this
 * file has to know it — a value one module treats as a colour and another
 * rejects is two modules disagreeing about what is safe to put in CSS. The
 * palette re-exports these.
 *
 * Deliberately narrow: our own prefix, our own id shape, a hex fallback, and
 * not one character more.
 */
export const GLOBAL_COLOR_RE = /^var\(--gc-[a-z0-9]{4,12},\s*#[0-9a-f]{3,8}\)$/i;

export function isGlobalColor(v: unknown): v is string {
  return typeof v === "string" && GLOBAL_COLOR_RE.test(v.trim());
}

/** The id inside a reference, or null when the value is a plain colour. */
export function tokenId(value: unknown): string | null {
  if (!isGlobalColor(value)) return null;
  return /^var\(--gc-([a-z0-9]{4,12})/.exec(value.trim())![1];
}

/** The custom property a global colour is published under. */
export const colorVar = (id: string): string => `--gc-${id}`;

/**
 * And the one its readable ink is published under.
 *
 * A second variable, not a nicety. `readableInk` is a calculation, and a
 * calculation done once at render freezes: change that global colour to a pale
 * one in settings and every button that took it keeps the white label it was
 * given, which is the AA promise this file exists to make total. Publishing the
 * ink alongside the colour is how the promise survives the colour changing.
 */
export const inkVar = (id: string): string => `--gc-${id}-ink`;

/**
 * Coerce a stored colour to a safe six-digit hex.
 *
 * These values reach `style` attributes, so anything that is not plainly a
 * colour is replaced rather than passed through. An admin field is not a reason
 * to let arbitrary text into CSS.
 */
export function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (HEX.test(v)) return v;
    if (/^#[0-9a-f]{3}$/i.test(v)) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    // A global colour is `var(--gc-…, #b4472b)`. The variable is what the page
    // draws; the hex inside it is what we can do ARITHMETIC on — the readable
    // ink over a button, the tint behind a panel. Without this every derived
    // colour on a block using a global one would be computed from the fallback
    // argument instead, and a dark brand colour would get black text on it.
    //
    // The SAME pattern the storage layer accepts, imported rather than written
    // out again: a value this treats as a colour and the normalizer rejects —
    // or the reverse — is two modules disagreeing about what is safe.
    if (GLOBAL_COLOR_RE.test(v)) {
      const hex = /(#[0-9a-f]{3,8})\s*\)$/.exec(v);
      if (hex) return normalizeHex(hex[1], fallback);
    }
  }
  return fallback;
}

function channels(hex: string): [number, number, number] {
  const h = normalizeHex(hex, "#000000").slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = luminance(hexA);
  const b = luminance(hexB);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// Pure black rather than the store's #0b0b0d ink. The difference is
// imperceptible on a filled surface, and it is what makes readableInk total:
// with #0b0b0d there is a band around luminance 0.183–0.190 — #cc22cc sits in
// it at 4.37:1 — where neither choice clears AA. Pure black closes that band.
const BLACK = "#000000";
const WHITE = "#ffffff";

/**
 * Text colour for a filled surface, guaranteed to clear AA (4.5:1).
 *
 * White wins where it passes, because a filled control with white text is the
 * store's established look. Where it does not — a pale colour — black is used.
 *
 * Total rather than best-effort: white clears 4.5:1 up to luminance 0.1833 and
 * black clears it from 0.175, so the ranges overlap and nothing can fall
 * between them. A test sweeps the colour cube to hold that true.
 */
export function readableInk(background: string): string {
  const id = tokenId(background);
  // A reference: hand back the ink the palette publishes for that colour, with
  // today's answer as the fallback. Computing it here and stopping would mean
  // white-on-pale the day somebody lightens the brand colour in settings.
  if (id) return `var(${inkVar(id)}, ${ink(background)})`;
  return ink(background);
}

/** The calculation itself, on a colour that is already a colour. */
function ink(background: string): string {
  return contrastRatio(background, WHITE) >= 4.5 ? WHITE : BLACK;
}

/**
 * A colour safe to put in CSS: a hex, or one of the store's global colours.
 *
 * The counterpart to `normalizeHex`, and the distinction is the whole point.
 * `normalizeHex` answers "what can I do arithmetic with" and resolves a
 * reference to the hex inside it. This one answers "what should the page draw"
 * and keeps the reference, so the colour still follows settings.
 */
export function normalizeColor(value: unknown, fallback: string): string {
  return isGlobalColor(value) ? value.trim() : normalizeHex(value, fallback);
}

/**
 * A translucent version of a colour, for tinted panels and hairlines.
 *
 * `rgba()` from the channels, which needs no `color-mix` — except for a global
 * colour, where the channels are not knowable until the page renders. There the
 * only honest answer is `color-mix`, and the reference carries its own hex
 * fallback into it. A wash computed from the hex instead would stop following
 * the colour the moment somebody changed it, which is the one thing a global
 * colour is for.
 */
export function tint(hex: string, alpha: number): string {
  const id = tokenId(hex);
  if (id) {
    const pct = Math.round(Math.max(0, Math.min(1, alpha)) * 1000) / 10;
    return `color-mix(in srgb, ${hex} ${pct}%, transparent)`;
  }
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

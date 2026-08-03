// Colour helpers shared by anything an admin can recolour.
//
// Extracted from lib/bump.ts when the sales page needed the same guarantees.
// One implementation, because the interesting part is not the maths — it is
// that the AA guarantee is total, and two copies of "total" drift.

const HEX = /^#[0-9a-f]{6}$/i;

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
  return contrastRatio(background, WHITE) >= 4.5 ? WHITE : BLACK;
}

/** `rgba()` from a hex, for tinted panels. Avoids relying on color-mix(). */
export function tint(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

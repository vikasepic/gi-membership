import { immediateChargeCents } from "@/lib/offers";
import { money } from "@/lib/money";

// The order bump's view model, derived in one place.
//
// Both the checkout and the admin preview build their bump through
// buildBumpView, so a preview cannot show something the checkout would render
// differently. That is the whole reason this file exists rather than the
// component reading offer fields directly.
//
// The split is deliberate: words are editable, facts about money are derived.
// A "Save 65%" badge typed by hand can disagree with what the card is actually
// charged; this one cannot.

/**
 * Default accent.
 *
 * The brand terracotta is #c8653d, but white on it is 3.90:1 — under AA for a
 * 13px bold banner label. #b0532f is 5.09:1 and visually near-identical, and is
 * already what the store's filled buttons use for exactly this reason.
 */
export const BUMP_ACCENT_DEFAULT = "#b0532f";

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Coerce a stored accent to a safe six-digit hex.
 *
 * This value reaches a `style` attribute, so anything that is not plainly a
 * colour is replaced rather than passed through — an admin field is not a
 * reason to let arbitrary text into CSS.
 */
export function normalizeAccent(value: unknown): string {
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (HEX.test(v)) return v;
    // #abc is a legitimate shorthand; expand rather than discard.
    if (/^#[0-9a-f]{3}$/i.test(v)) {
      return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    }
  }
  return BUMP_ACCENT_DEFAULT;
}

function channels(hex: string): [number, number, number] {
  const h = normalizeAccent(hex).slice(1);
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

// Pure black, not the store's #0b0b0d ink. The difference is imperceptible on
// a filled banner, and it is what makes the guarantee below total: with #0b0b0d
// there is a band around luminance 0.183–0.190 — #cc22cc sits in it at 4.37:1 —
// where neither white nor ink clears AA. Pure black closes that band.
const INK = "#000000";
const WHITE = "#ffffff";

/**
 * Text colour for a filled accent surface, guaranteed to clear AA (4.5:1).
 *
 * White wins where it passes, because a filled control with white text is the
 * store's established look. Where it does not — a pale accent — black is used,
 * which is what the colour actually calls for.
 *
 * The guarantee is total rather than best-effort: white clears 4.5:1 up to
 * luminance 0.1833 and black clears it from 0.175, so the two ranges overlap
 * and no accent can fall between them. A test sweeps the colour cube to hold
 * that true, because the failure mode is an unreadable banner on whichever
 * colour an admin happens to pick.
 */
export function bumpInk(accent: string): string {
  return contrastRatio(accent, WHITE) >= 4.5 ? WHITE : INK;
}

/** `rgba()` from a hex, for tinted panels. Avoids relying on color-mix(). */
export function tint(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type OfferLike = {
  billingType: "one_time" | "recurring";
  priceCents: number;
  compareAtCents: number | null;
  currency: string;
  interval: string | null;
  trialDays: number | null;
  headline: string;
  description: string | null;
  bumpHeadline: string | null;
  bumpDescription: string | null;
  bumpBanner: string | null;
  bumpBullets: string[] | null;
  bumpNote: string | null;
  bumpAccent: string | null;
};

/**
 * The banner shown when an offer has never been edited.
 *
 * Deliberately not "Limited time offer". This bump sits on every checkout, so
 * a countdown claim would be untrue — and an untrue claim beside a card field
 * is the worst place to spend trust. A real deadline can still be typed in.
 */
export function defaultBanner(offer: Pick<OfferLike, "billingType" | "trialDays">): string {
  if (offer.billingType === "recurring" && offer.trialDays && offer.trialDays > 0) {
    return `Free for ${offer.trialDays} days`;
  }
  return "Add to your order";
}

/**
 * The badge, computed from the real numbers.
 *
 * A trial is the stronger claim where one exists, because "7 days free" beats
 * a percentage the buyer has to evaluate. Otherwise it is the genuine saving
 * against the compare-at price, and nothing at all when there is no saving to
 * report — an empty badge is better than a manufactured one.
 */
export function saveBadge(offer: Pick<OfferLike, "billingType" | "priceCents" | "compareAtCents" | "trialDays">): string | null {
  if (offer.billingType === "recurring" && offer.trialDays && offer.trialDays > 0) {
    return `${offer.trialDays} days free`;
  }
  const was = offer.compareAtCents;
  if (!was || was <= offer.priceCents) return null;
  const pct = Math.round(((was - offer.priceCents) / was) * 100);
  return pct > 0 ? `Save ${pct}%` : null;
}

export type BumpView = {
  banner: string | null;
  saveBadge: string | null;
  headline: string;
  description: string | null;
  bullets: string[];
  note: string | null;
  accent: string;
  ink: string;
  /** Struck-through price, already formatted. Null when there is nothing to compare. */
  wasLabel: string | null;
  nowLabel: string;
  termsLabel: string | null;
  chargeNowCents: number;
  currency: string;
};

export function buildBumpView(offer: OfferLike): BumpView {
  const chargeNowCents = immediateChargeCents(offer);
  const accent = normalizeAccent(offer.bumpAccent);

  const terms =
    offer.billingType === "recurring"
      ? `then ${money(offer.priceCents, offer.currency)}/${offer.interval ?? "month"}${
          offer.trialDays ? `, cancel any time` : ""
        }`
      : null;

  return {
    // null means never edited — show the honest default. An empty string is an
    // explicit "no banner", which is how the editor turns it off.
    banner: offer.bumpBanner === null ? defaultBanner(offer) : offer.bumpBanner.trim() || null,
    saveBadge: saveBadge(offer),
    // Bump-specific copy where it exists, else the offer's own — so an offer
    // that never set it reads exactly as it did before.
    headline: offer.bumpHeadline?.trim() || offer.headline,
    description: offer.bumpDescription?.trim() || offer.description,
    bullets: (offer.bumpBullets ?? []).map((b) => b.trim()).filter(Boolean),
    note: offer.bumpNote?.trim() || null,
    accent,
    ink: bumpInk(accent),
    wasLabel:
      offer.compareAtCents && offer.compareAtCents > chargeNowCents
        ? money(offer.compareAtCents, offer.currency)
        : null,
    nowLabel: money(chargeNowCents, offer.currency),
    termsLabel: terms,
    chargeNowCents,
    currency: offer.currency,
  };
}

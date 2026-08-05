import { immediateChargeCents } from "@/lib/offers";
import { normalizeHex, readableInk, luminance, contrastRatio, tint } from "@/lib/color";
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

// Colour handling lives in lib/color.ts — the sales page needs the same
// guarantees, and two copies of "provably AA" drift.
export function normalizeAccent(value: unknown): string {
  return normalizeHex(value, BUMP_ACCENT_DEFAULT);
}

/** Text colour for the banner and the added bar. Always clears AA. */
export const bumpInk = readableInk;

export { luminance, contrastRatio, tint };

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

/**
 * Which of a bump's prices was taken.
 *
 * "none" is a real option rather than the absence of one: with two prices the
 * control is a radio group, and a radio cannot be unticked by clicking it
 * again — so declining has to be something you can select.
 */
export type BumpChoice = "none" | "main" | "alt";

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
  /** What is taken TODAY. Zero through a trial, which is the point of one. */
  nowLabel: string;
  /**
   * What it costs on its own terms — "$29/month", "$199/year".
   *
   * Separate from nowLabel because a trial makes them different, and a choice
   * between two trials cannot be made on the charge-now figure: both read $0.
   * Null for a one-time price, where nowLabel already is the price.
   */
  planLabel: string | null;
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
    planLabel:
      offer.billingType === "recurring"
        ? `${money(offer.priceCents, offer.currency)}/${offer.interval ?? "month"}`
        : null,
    termsLabel: terms,
    chargeNowCents,
    currency: offer.currency,
  };
}

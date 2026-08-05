import { walkBlocks, normalizeBlocks, type Block } from "@/lib/blocks";

/**
 * Prices a page states that the checkout will not charge.
 *
 * The Price card lets an admin type a figure. It is there because some pages
 * want a currency the store does not sell in, or a price expressed as "from
 * £X" — but the same field is how a page ends up advertising a number nobody
 * will be charged. This store has already done it once: a stored FAQ said $47
 * while the offer took $29, on a live page taking payment.
 *
 * The rule is narrow on purpose. A typed price is refused only when it is a
 * plain figure that DISAGREES with the real one — not when it is empty (which
 * means "use the real one"), and not when it is prose the checker cannot parse,
 * because guessing at "from $29/seat" and being wrong would block a save for no
 * reason.
 */

export type PriceProblem = {
  /** Which section the offending card is in. */
  sectionKey: string;
  blockId: string;
  typed: string;
  real: string;
};

/** The figures in a string, in cents, ignoring currency symbols and words. */
function figures(text: string): number[] {
  const out: number[] = [];
  // 1,299.50 / 1299.50 / 1299 — the separators people actually type.
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d{1,2})?/g)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(Math.round(n * 100));
  }
  return out;
}

/**
 * Whether a typed price contradicts the real one.
 *
 * True only when both parse to a single figure and those figures differ. Two
 * figures on either side ("$29–$49", "$29 or $199") is a range or a choice,
 * and a range that contains the real price is not a lie.
 */
export function contradicts(typed: string, real: string): boolean {
  const t = figures(typed);
  const r = figures(real);
  if (t.length !== 1 || r.length !== 1) return false;
  return t[0] !== r[0];
}

/**
 * Every price card on these blocks whose typed price contradicts `real`.
 *
 * `real` is the figure the page would show if the field were left empty — the
 * offer's or product's own price, formatted the same way.
 */
export function priceProblems(
  blocks: unknown,
  sectionKey: string,
  real: string | null,
): PriceProblem[] {
  if (!real) return [];
  const tree: Block[] = Array.isArray(blocks) ? normalizeBlocks(blocks) : [];
  const out: PriceProblem[] = [];
  for (const block of walkBlocks(tree)) {
    if (block.type !== "pricecard") continue;
    const typed = String(block.props.price ?? "").trim();
    if (!typed || !contradicts(typed, real)) continue;
    out.push({ sectionKey, blockId: block.id, typed, real });
  }
  return out;
}

/** One sentence naming what is wrong and what to do about it. */
export function priceProblemMessage(problems: PriceProblem[]): string | null {
  if (problems.length === 0) return null;
  const p = problems[0];
  const more = problems.length > 1 ? ` (and ${problems.length - 1} more)` : "";
  return `This section's price card says ${p.typed}, but the checkout charges ${p.real}${more}. Clear the Price field to show the real figure, or change the price on the offer.`;
}

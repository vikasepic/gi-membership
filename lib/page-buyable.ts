import { walkBlocks, normalizeBlocks, type Block } from "@/lib/blocks";

/**
 * Whether a page has anything on it a buyer can actually buy from.
 *
 * A Button block starts as "Go to a link", so a new one looks right and does
 * nothing until its action is changed. The symptom is the worst kind: a page
 * that renders perfectly, reads perfectly, and quietly cannot be bought from.
 * Nothing else catches it — the block is valid, the page is valid, and the
 * only evidence is a conversion rate of zero.
 *
 * A price card counts too, but only once it has a button label: a card with no
 * label renders no control, whatever its action says.
 */

export function buysSomething(block: Block): boolean {
  if (block.type === "button") {
    return block.props.action === "buy" && String(block.props.text ?? "").trim().length > 0;
  }
  if (block.type === "pricecard") {
    return String(block.props.ctaLabel ?? "").trim().length > 0;
  }
  return false;
}

/** How many buy controls these sections carry between them. */
export function countBuyControls(sections: { content: unknown }[]): number {
  let n = 0;
  for (const section of sections) {
    const raw = (section.content as { blocks?: unknown } | null)?.blocks;
    if (!Array.isArray(raw)) continue;
    for (const block of walkBlocks(normalizeBlocks(raw))) if (buysSomething(block)) n++;
  }
  return n;
}

/**
 * Whether to warn, and only where warning is honest.
 *
 * A page with no blocks at all has not been built yet — telling someone their
 * empty page cannot be bought from is noise, and it would sit there through
 * the whole of writing it.
 */
export function warnNotBuyable(sections: { content: unknown }[]): boolean {
  const written = sections.some((s) => {
    const raw = (s.content as { blocks?: unknown } | null)?.blocks;
    return Array.isArray(raw) && raw.length > 0;
  });
  return written && countBuyControls(sections) === 0;
}

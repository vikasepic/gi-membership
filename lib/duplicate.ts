/**
 * What a duplicated record is made of.
 *
 * Pure, so the rules about what carries can be read and tested without a
 * database. The writes live in lib/duplicate-write.ts.
 */

/**
 * Columns a copy never inherits.
 *
 * The identity and the timestamps because it is a new row. The Stripe ids
 * because a duplicate is NOT the same product to Stripe — two records sharing
 * one Stripe object means the first sale through either rewrites the other's,
 * and neither would look wrong until it did.
 */
export const DROPPED_COLUMNS = [
  "id",
  "created_at",
  "updated_at",
  "stripe_product_id_test",
  "stripe_price_id_test",
  "stripe_product_id_live",
  "stripe_price_id_live",
] as const satisfies readonly string[];

/** The source row minus what a copy never inherits, with `over` on top. */
export function duplicateRow(
  row: Record<string, unknown>,
  over: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if ((DROPPED_COLUMNS as readonly string[]).includes(k)) continue;
    out[k] = v;
  }
  return { ...out, ...over };
}

/**
 * An array of price ids, pointed at the copy's own prices.
 *
 * Only for arrays that name the record's OWN prices — which is
 * `offers.page_price_ids` and nothing else. Those rows are copied with new
 * ids, so carrying the array across leaves the duplicate's page offering the
 * ORIGINAL's prices, and because it is jsonb with no foreign key that writes
 * cleanly and fails silently.
 *
 * `products.bump_price_ids` and `upsell_price_ids` are NOT this. They name the
 * prices of the bump/upsell OFFER — a record the copy shares with the original
 * — so their ids are still valid on the copy and remapping them would empty
 * them. See lib/duplicate-write.ts, which is where that division is decided.
 *
 * An id with no counterpart is dropped: a missing option is a visible problem,
 * a dangling one is not.
 */
export function remapPriceIds(value: unknown, byOldId: Map<string, string>): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const mapped = byOldId.get(v);
    if (mapped) out.push(mapped);
  }
  return out;
}

/**
 * The same rewrite, one level deeper: inside a copied section's blocks.
 *
 * A "Ways to pay" block stores `priceIds` in `page_sections.content`
 * (lib/blocks.ts), and copyPage carries content across verbatim — so a page
 * curated to show yearly only comes out naming prices the copy does not have,
 * and `chosenPrices` answers that with the whole live menu.
 *
 * Blank `offerId` means "whatever this page is selling", which on an offer's
 * own page is the prices that were just copied. A block naming a DIFFERENT
 * offer is a shared reference whose ids are still valid, and is left alone —
 * the same division as the price-id columns above.
 *
 * Returns null when nothing changed, so an untouched section is not rewritten.
 * Blocks are untrusted stored JSON, so this walks the shape it finds rather
 * than the shape it expects, and never drops a key it does not understand.
 */
export function remapBlockPriceIds(
  content: unknown,
  byOldId: Map<string, string>,
): Record<string, unknown> | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const root = content as Record<string, unknown>;
  if (!Array.isArray(root.blocks)) return null;

  let changed = false;
  const walk = (list: unknown[]): unknown[] =>
    list.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
      const block = entry as Record<string, unknown>;
      let next = block;

      const props = block.props;
      if (
        block.type === "prices" &&
        props &&
        typeof props === "object" &&
        !Array.isArray(props)
      ) {
        const p = props as Record<string, unknown>;
        const named = typeof p.offerId === "string" ? p.offerId.trim() : "";
        if (!named && Array.isArray(p.priceIds) && p.priceIds.length > 0) {
          const ids = remapPriceIds(p.priceIds, byOldId);
          if (JSON.stringify(ids) !== JSON.stringify(p.priceIds)) {
            changed = true;
            next = { ...next, props: { ...p, priceIds: ids } };
          }
        }
      }

      // Rows hold one array of blocks per column, and a prices block is as
      // likely to be in a column as at the top level.
      if (Array.isArray(block.columns)) {
        const columns = block.columns.map((col) => (Array.isArray(col) ? walk(col) : col));
        next = { ...next, columns };
      }
      return next;
    });

  const blocks = walk(root.blocks);
  return changed ? { ...root, blocks } : null;
}

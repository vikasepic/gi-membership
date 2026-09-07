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
 * `offers.page_price_ids`, `products.bump_price_ids` and `upsell_price_ids`
 * name price rows by id. The copy's prices are new rows with new ids, so
 * carrying these across leaves the duplicate offering the ORIGINAL's prices —
 * and because they are jsonb with no foreign key, that writes cleanly and
 * fails silently.
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

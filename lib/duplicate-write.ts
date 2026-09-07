import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { duplicateRow, remapPriceIds } from "@/lib/duplicate";
import { offerKeyProblem } from "@/lib/offer-key";
import {
  copyPage,
  getPageSettings,
  hasPageSections,
  savePageSettings,
  type OwnerType,
} from "@/lib/pages";

/**
 * Copying a product or an offer.
 *
 * Selling the same thing a second way otherwise means retyping every field,
 * re-entering both prices and rebuilding an eleven-section sales page band by
 * band. What carries and what does not is decided in lib/duplicate.ts; this
 * module only does the writes, in an order that is not arbitrary — see below.
 */

/** The new record, and everything that did not make it across. */
export type DuplicateResult = { id: string; warnings: string[] };

type Kind = {
  table: "products" | "offers";
  /** What an admin calls it, for the sentences. */
  noun: string;
  /** The column that is the public address, and is unique per store. */
  keyColumn: "slug" | "key";
  priceTable: "product_prices" | "offer_prices";
  priceParent: "product_id" | "offer_id";
  /** jsonb arrays of price ids that must be pointed at the copy's own prices. */
  priceIdColumns: readonly string[];
  ownerType: OwnerType;
  /** Whatever makes the copy arrive switched off. */
  off: Record<string, unknown>;
};

const PRODUCT: Kind = {
  table: "products",
  noun: "product",
  keyColumn: "slug",
  priceTable: "product_prices",
  priceParent: "product_id",
  priceIdColumns: ["bump_price_ids", "upsell_price_ids"],
  ownerType: "product",
  off: { status: "draft" },
};

const OFFER: Kind = {
  table: "offers",
  noun: "offer",
  keyColumn: "key",
  priceTable: "offer_prices",
  priceParent: "offer_id",
  priceIdColumns: ["page_price_ids"],
  ownerType: "offer",
  off: { active: false },
};

async function duplicate(kind: Kind, id: string, key: string): Promise<DuplicateResult> {
  const db = createServiceClient();
  const storeId = await getStoreId();
  const wanted = key.trim();

  // Refused as a sentence, before any write. Both of these columns are
  // UNIQUE (store_id, …), so without the check the admin meets a constraint
  // violation from PostgREST instead of an answer.
  const problem = offerKeyProblem(wanted);
  if (problem) throw new Error(problem);

  const { data: source, error: readErr } = await db
    .from(kind.table)
    .select("*")
    .eq("id", id)
    .eq("store_id", storeId)
    .maybeSingle();
  if (readErr) throw new Error(`Could not read that ${kind.noun}: ${readErr.message}`);
  if (!source) throw new Error(`That ${kind.noun} no longer exists.`);

  const { data: taken, error: takenErr } = await db
    .from(kind.table)
    .select("id")
    .eq("store_id", storeId)
    .eq(kind.keyColumn, wanted)
    .maybeSingle();
  if (takenErr) throw new Error(`Could not check that ${kind.keyColumn}: ${takenErr.message}`);
  if (taken) throw new Error(`Another ${kind.noun} is already using “${wanted}”. Pick a different one.`);

  // The record first. Everything after it is best-effort, because a half-copied
  // record is visible in the admin and can be deleted, while the rows that
  // would be left behind by failing later are not: page_sections joins on
  // (owner_type, owner_id) by convention, with no foreign key, so nothing can
  // find or clean them once their owner does not exist.
  const { data: created, error: writeErr } = await db
    .from(kind.table)
    .insert(duplicateRow(source, { [kind.keyColumn]: wanted, ...kind.off }))
    .select("id")
    .single();
  if (writeErr || !created) {
    throw new Error(`Could not create the copy: ${writeErr?.message ?? "no row came back"}`);
  }
  const newId = created.id as string;

  const warnings: string[] = [];
  const attempt = async (what: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (e) {
      warnings.push(`${what}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // The prices, archived ones included — an archived price is part of this
  // record's history, and a copy missing them is a different record.
  const byOldId = new Map<string, string>();
  await attempt("The prices were not copied", async () => {
    const { data: prices, error } = await db
      .from(kind.priceTable)
      .select("*")
      .eq(kind.priceParent, id)
      .order("sort_order")
      .order("created_at");
    if (error) throw new Error(error.message);
    if (!prices || prices.length === 0) return;

    // Ids minted here rather than by the database, so one insert also gives us
    // the old-to-new map the price-id arrays below are rewritten through.
    const rows = prices.map((p) => {
      const fresh = crypto.randomUUID();
      byOldId.set(p.id as string, fresh);
      return duplicateRow(p, { id: fresh, [kind.priceParent]: newId });
    });
    const { error: insErr } = await db.from(kind.priceTable).insert(rows);
    if (insErr) {
      byOldId.clear();
      throw new Error(insErr.message);
    }
  });

  // The silent one. These jsonb arrays name price rows by id and have no
  // foreign key, so carrying the originals across writes cleanly and leaves the
  // copy's page selling the ORIGINAL's prices, with nothing complaining.
  await attempt("The page's prices were not re-pointed at the copy", async () => {
    const remapped = Object.fromEntries(
      kind.priceIdColumns.map((c) => [c, remapPriceIds(source[c], byOldId)]),
    );
    const { error } = await db.from(kind.table).update(remapped).eq("id", newId);
    if (error) throw new Error(error.message);
  });

  await attempt("The sales page was not copied", async () => {
    // A record with no sales page is ordinary, and copyPage throws on an empty
    // source — asked first so that ordinary case is not reported as a problem.
    if (!(await hasPageSections(kind.ownerType, id))) return;
    await copyPage(
      { ownerType: kind.ownerType, ownerId: id },
      { ownerType: kind.ownerType, ownerId: newId },
    );
  });

  await attempt("The page settings were not copied", async () => {
    const settings = await getPageSettings(kind.ownerType, id);
    const empty =
      !settings.customCss &&
      !settings.customJs &&
      settings.snippets.length === 0 &&
      !settings.metaTitle &&
      !settings.metaDescription &&
      !settings.shareImagePath;
    if (empty) return;
    await savePageSettings(kind.ownerType, newId, settings);
  });

  return { id: newId, warnings };
}

/** Copy a product, its prices, its sales page and its page settings. Arrives draft. */
export const duplicateProduct = (id: string, slug: string) => duplicate(PRODUCT, id, slug);

/** Copy an offer, its prices, its sales page and its page settings. Arrives inactive. */
export const duplicateOffer = (id: string, key: string) => duplicate(OFFER, id, key);

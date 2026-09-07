import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { duplicateRow, remapBlockPriceIds, remapPriceIds } from "@/lib/duplicate";
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
  /**
   * jsonb arrays naming this record's OWN prices, which must therefore be
   * pointed at the copy's new price rows.
   *
   * Only arrays whose ids come out of `priceTable` belong here. An array
   * naming another record's prices is a shared reference, still valid on the
   * copy, and remapping it would empty it — see PRODUCT below.
   */
  priceIdColumns: readonly string[];
  ownerType: OwnerType;
  /**
   * Whether a "Ways to pay" block on this record's page, with no offer named,
   * is showing this record's own prices. True for an offer, whose page sells
   * the offer itself; false for a product, whose page sells the offer the
   * product is sold on — a record the copy shares with the original.
   */
  ownPricesOnPage: boolean;
  /** Whatever makes the copy arrive switched off. */
  off: Record<string, unknown>;
};

const PRODUCT: Kind = {
  table: "products",
  noun: "product",
  keyColumn: "slug",
  priceTable: "product_prices",
  priceParent: "product_id",
  // Empty, deliberately. `bump_price_ids` and `upsell_price_ids` do NOT name
  // this product's prices — they name the prices of the bump/upsell OFFER
  // ("Which of the bump offer's prices this product shows, in order",
  // migration 0049) — or of the bump PRODUCT, which 0056 forbids from being
  // this product at all — and the copy points at the same one unchanged.
  // Remapping them through the product's own old-to-new table matches nothing and
  // writes [], and an empty list is not inert: lib/offer-prices.ts's
  // shownPrices falls back to the offer's FIRST live price, so the copy would
  // quietly sell a different add-on at a different price.
  priceIdColumns: [],
  ownerType: "product",
  ownPricesOnPage: false,
  off: { status: "draft" },
};

const OFFER: Kind = {
  table: "offers",
  noun: "offer",
  keyColumn: "key",
  priceTable: "offer_prices",
  priceParent: "offer_id",
  // This one really does name the offer's own prices — app/(store)/p/[slug]
  // reads it against `soldOn.prices` — so it is remapped.
  priceIdColumns: ["page_price_ids"],
  ownerType: "offer",
  ownPricesOnPage: true,
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
    .insert(
      duplicateRow(source, {
        [kind.keyColumn]: wanted,
        ...kind.off,
        // The remapped arrays are seeded EMPTY rather than carried. Rewriting
        // them is a later, failure-tolerant step, so an insert holding the
        // original's price ids plus an update that fails leaves the copy
        // pointing at the original's price rows — the exact silent state this
        // feature exists to prevent, with only a warning to say so. "No
        // options yet" is visible on the page; the original's options are not.
        ...Object.fromEntries(kind.priceIdColumns.map((c) => [c, []])),
      }),
    )
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

  // The silent one. These jsonb arrays name this record's own price rows by id
  // and have no foreign key, so carrying the originals across writes cleanly
  // and leaves the copy's page selling the ORIGINAL's prices, with nothing
  // complaining. Only the columns in priceIdColumns — the arrays that name
  // another record's prices are shared references and are carried verbatim.
  await attempt("The page's prices were not re-pointed at the copy", async () => {
    if (kind.priceIdColumns.length === 0) return;
    const remapped = Object.fromEntries(
      kind.priceIdColumns.map((c) => [c, remapPriceIds(source[c], byOldId)]),
    );
    const { error } = await db.from(kind.table).update(remapped).eq("id", newId);
    if (error) throw new Error(error.message);
  });

  // What the product actually delivers. The attachment lives in a join table,
  // not on the row, so nothing above copies it and the copy would grant an
  // empty library: the buyer pays and receives nothing. Shared, not deep
  // copied — the copy names the same courses.
  if (kind.table === "products") {
    await attempt("The courses were not attached to the copy", async () => {
      const { data: links, error } = await db
        .from("product_courses")
        .select("course_id, sort_order")
        .eq("product_id", id);
      if (error) throw new Error(error.message);
      if (!links || links.length === 0) return;
      const { error: insErr } = await db
        .from("product_courses")
        .insert(links.map((l) => ({ ...l, product_id: newId })));
      if (insErr) throw new Error(insErr.message);
    });
  }

  await attempt("The sales page was not copied", async () => {
    // A record with no sales page is ordinary, and copyPage throws on an empty
    // source — asked first so that ordinary case is not reported as a problem.
    if (!(await hasPageSections(kind.ownerType, id))) return;
    await copyPage(
      { ownerType: kind.ownerType, ownerId: id },
      { ownerType: kind.ownerType, ownerId: newId },
    );
  });

  // The same rewrite as the columns above, one level deeper: a Ways to pay
  // block stores its chosen price ids inside the section's content, and
  // copyPage carries content across verbatim. Runs after the page is copied,
  // on the COPY's rows.
  await attempt("The page's price blocks were not re-pointed at the copy", async () => {
    if (!kind.ownPricesOnPage || byOldId.size === 0) return;
    const { data: rows, error } = await db
      .from("page_sections")
      .select("id, content")
      .eq("owner_type", kind.ownerType)
      .eq("owner_id", newId);
    if (error) throw new Error(error.message);
    for (const row of rows ?? []) {
      const content = remapBlockPriceIds(row.content, byOldId);
      if (!content) continue;
      const { error: upErr } = await db.from("page_sections").update({ content }).eq("id", row.id);
      if (upErr) throw new Error(upErr.message);
    }
  });

  await attempt("The page settings were not copied", async () => {
    // Asked as "is there a row" first, because getPageSettings answers a read
    // failure with the same empty settings it gives a record that has none
    // (lib/pages.ts). Without this a transient failure would report a clean
    // copy of a page that had silently lost its SEO and its custom code.
    const { data: row, error } = await db
      .from("page_settings")
      .select("owner_id")
      .eq("owner_type", kind.ownerType)
      .eq("owner_id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return;
    await savePageSettings(kind.ownerType, newId, await getPageSettings(kind.ownerType, id));
  });

  // Not a failure — a consequence of the copy having a new key, and the only
  // one nothing on screen would show. A coded upsell page is registered
  // against `offers.key` (components/oto/registry.tsx) and an unregistered key
  // falls back to the default layout, so the copy's upsell page is a different
  // page from the original's.
  if (kind.table === "offers" && source.oto_template === "custom") {
    warnings.push(
      "The upsell page layout was “Custom”, which is coded against the original’s key. " +
        "The copy will use the default layout until one is built for the new key.",
    );
  }

  return { id: newId, warnings };
}

/** Copy a product, its prices, its courses, its sales page and its page settings. Arrives draft. */
export const duplicateProduct = (id: string, slug: string) => duplicate(PRODUCT, id, slug);

/** Copy an offer, its prices, its sales page and its page settings. Arrives inactive. */
export const duplicateOffer = (id: string, key: string) => duplicate(OFFER, id, key);

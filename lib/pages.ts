import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { camelize } from "@/lib/case";
import { normalizeHex } from "@/lib/color";
import {
  SECTIONS,
  SECTION_KEYS,
  BAND_STYLE_KEYS,
  sectionDef,
  defaultRows,
  type SectionRow,
} from "@/lib/page-sections";

export type OwnerType = "product" | "offer";

/**
 * The sections for one page, in order.
 *
 * A page that has never been edited returns the defaults rather than nothing,
 * so opening the editor shows a complete page to work from instead of ten empty
 * boxes — and so a page can be switched on before anyone has written a word.
 */
export async function getPageSections(owner: OwnerType, ownerId: string): Promise<SectionRow[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("page_sections")
    .select("section_key, position, enabled, style, accent, variant, content")
    .eq("owner_type", owner)
    .eq("owner_id", ownerId)
    .order("position");
  if (error) throw new Error(`getPageSections: ${error.message}`);

  const stored = new Map(
    camelize<SectionRow[]>(data ?? []).map((r) => [r.sectionKey, r]),
  );
  // Merge onto the canonical list rather than returning what happens to be in
  // the table: a section added to the code later must appear on existing pages.
  return defaultRows().map((d) => stored.get(d.sectionKey) ?? d);
}

/** True when anyone has configured this page at all. */
export async function hasPageSections(owner: OwnerType, ownerId: string): Promise<boolean> {
  const db = createServiceClient();
  const { count, error } = await db
    .from("page_sections")
    .select("id", { count: "exact", head: true })
    .eq("owner_type", owner)
    .eq("owner_id", ownerId);
  if (error) return false;
  return (count ?? 0) > 0;
}

export type SectionInput = {
  enabled: boolean;
  style: string;
  accent: string | null;
  variant: string | null;
  content: Record<string, unknown>;
};

/**
 * Save one section.
 *
 * Deliberately one row: this is what makes "save just this section" true rather
 * than a label on a button. Writing the whole page as a blob would let a save
 * of section 4 silently discard an edit to section 9 made a moment earlier.
 */
export async function saveSection(
  owner: OwnerType,
  ownerId: string,
  sectionKey: string,
  input: SectionInput,
): Promise<void> {
  const def = sectionDef(sectionKey);
  if (!def) throw new Error(`unknown section: ${sectionKey}`);

  const position = SECTION_KEYS.indexOf(def.key);
  const style = BAND_STYLE_KEYS.includes(input.style as never) ? input.style : def.defaultStyle;
  const variant = def.variants?.some((v) => v.key === input.variant) ? input.variant : null;

  const db = createServiceClient();
  const { error } = await db.from("page_sections").upsert(
    {
      store_id: await getStoreId(),
      owner_type: owner,
      owner_id: ownerId,
      section_key: def.key,
      position,
      enabled: input.enabled,
      style,
      // Validated before it can reach a style attribute.
      accent: input.accent ? normalizeHex(input.accent, def.defaultStyle) : null,
      variant,
      content: input.content,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_type,owner_id,section_key" },
  );
  if (error) throw new Error(`saveSection: ${error.message}`);
}

/**
 * Write the full default page.
 *
 * Called once when someone turns a sales page on, so every section exists as a
 * real row and the editor's per-section saves have something to update.
 */
export async function seedPage(owner: OwnerType, ownerId: string): Promise<void> {
  const db = createServiceClient();
  const storeId = await getStoreId();
  const rows = SECTIONS.map((def, i) => ({
    store_id: storeId,
    owner_type: owner,
    owner_id: ownerId,
    section_key: def.key,
    position: i,
    enabled: true,
    style: def.defaultStyle,
    accent: null,
    variant: def.variants?.[0]?.key ?? null,
    content: {},
  }));
  const { error } = await db
    .from("page_sections")
    .upsert(rows, { onConflict: "owner_type,owner_id,section_key", ignoreDuplicates: true });
  if (error) throw new Error(`seedPage: ${error.message}`);
}

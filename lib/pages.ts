import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { camelize } from "@/lib/case";
import { normalizeHex } from "@/lib/color";
import { normalizeBackground, type Background } from "@/lib/blocks";
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
    .select("section_key, position, enabled, style, accent, variant, content, background, css_id, css_class, updated_at")
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
  /**
   * A picture or a wash over the band's own colour. Null means the preset alone.
   *
   * The band still decides the ink, so the words stay readable when the image
   * is slow, fails, or turns out lighter than it looked in the picker.
   */
  background?: Background | null;
  /** A DOM id for this band, so a button can link to #it. */
  cssId?: string | null;
  cssClass?: string | null;
};

/**
 * A CSS identifier, or nothing.
 *
 * This lands in an id attribute and in a selector, so anything that is not a
 * letter, a digit, a hyphen or an underscore is dropped rather than escaped —
 * the only safe answer to a quote or a bracket here is that there isn't one. A
 * leading digit is invalid in a selector, so it is prefixed rather than
 * silently producing an id nothing can target.
 */
export function cssIdent(value: string | null | undefined): string | null {
  const cleaned = String(value ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "");
  if (!cleaned) return null;
  return /^[0-9-]/.test(cleaned) ? `s-${cleaned}` : cleaned;
}

/** A class list: the same rule, applied to each name. */
export function cssClasses(value: string | null | undefined): string | null {
  const names = String(value ?? "")
    .split(/\s+/)
    .map((n) => cssIdent(n))
    .filter(Boolean);
  return names.length > 0 ? names.join(" ") : null;
}

/**
 * Save one section.
 *
 * Deliberately one row: this is what makes "save just this section" true rather
 * than a label on a button. Writing the whole page as a blob would let a save
 * of section 4 silently discard an edit to section 9 made a moment earlier.
 */
/** Thrown when the row moved under you. Carries who to blame and when. */
export class StaleSectionError extends Error {
  constructor(readonly savedAt: string) {
    super("This section was changed by someone else while you had it open.");
    this.name = "StaleSectionError";
  }
}

export async function saveSection(
  owner: OwnerType,
  ownerId: string,
  sectionKey: string,
  input: SectionInput,
  /**
   * The `updated_at` this editor loaded.
   *
   * Supplied, the write refuses to land on a row that has moved since — which
   * is the only thing that actually stops one person's work vanishing under
   * another's. Absent, the write is unconditional, so callers that have no
   * baseline to offer (seeding a page, a script) are unaffected.
   */
  baseUpdatedAt?: string | null,
): Promise<string | null> {
  const def = sectionDef(sectionKey);
  if (!def) throw new Error(`unknown section: ${sectionKey}`);

  const position = SECTION_KEYS.indexOf(def.key);
  const style = BAND_STYLE_KEYS.includes(input.style as never) ? input.style : def.defaultStyle;
  const variant = def.variants?.some((v) => v.key === input.variant) ? input.variant : null;

  const db = createServiceClient();
  const row = {
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
      // Normalised through the same reader a block's background uses — one
      // shape, one set of rules, one renderer.
      background:
        input.background && input.background.type !== "none"
          ? normalizeBackground(input.background)
          : null,
      css_id: cssIdent(input.cssId),
      css_class: cssClasses(input.cssClass),
      updated_at: new Date().toISOString(),
  };

  if (baseUpdatedAt) {
    const landed = await updateIfUnchanged(owner, ownerId, def.key, baseUpdatedAt, row);
    if (landed) return landed;
    // Either the row moved under us, or there is no row yet. Only the first is
    // a conflict — a section saved for the first time has nothing to lose.
    const { data: current } = await db
      .from("page_sections")
      .select("updated_at")
      .eq("owner_type", owner)
      .eq("owner_id", ownerId)
      .eq("section_key", def.key)
      .maybeSingle();
    if (current) throw new StaleSectionError(current.updated_at as string);
  }

  // Read the stamp back rather than trusting the one we sent: a BEFORE UPDATE
  // trigger sets updated_at = now(), so the value that lands is the database's,
  // not ours. Returning ours would hand the editor a baseline that never
  // matches, and the next save would report a conflict with nobody.
  const { data, error } = await db
    .from("page_sections")
    .upsert(row, { onConflict: "owner_type,owner_id,section_key" })
    .select("updated_at")
    .maybeSingle();
  if (error) throw new Error(`saveSection: ${error.message}`);
  return (data?.updated_at as string) ?? null;
}

/**
 * Write, but only onto the row we read.
 *
 * The check and the write are one statement on purpose. Reading the row,
 * comparing in JavaScript and then writing leaves a window in which the other
 * person's save lands between the two and is overwritten anyway — the same bug,
 * made narrower rather than fixed. `eq("updated_at", …)` closes it: Postgres
 * matches zero rows if anything moved, and zero rows is the answer.
 *
 * Returns the new stamp when it landed, or null when it did not.
 */
async function updateIfUnchanged(
  owner: OwnerType,
  ownerId: string,
  sectionKey: string,
  baseUpdatedAt: string,
  row: Record<string, unknown>,
): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("page_sections")
    .update(row)
    .eq("owner_type", owner)
    .eq("owner_id", ownerId)
    .eq("section_key", sectionKey)
    .eq("updated_at", baseUpdatedAt)
    .select("updated_at");
  // The stamp the trigger wrote, which is the baseline for the next save.
  return (data ?? []).length > 0 ? ((data![0].updated_at as string) ?? null) : null;
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

// --- page-level custom code -------------------------------------------------

export type PageSettings = { customCss: string; customJs: string };

export const NO_PAGE_SETTINGS: PageSettings = { customCss: "", customJs: "" };

export async function getPageSettings(owner: OwnerType, ownerId: string): Promise<PageSettings> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("page_settings")
    .select("custom_css, custom_js")
    .eq("owner_type", owner)
    .eq("owner_id", ownerId)
    .maybeSingle();
  // A page renders without its custom code; it does not render without the
  // page. So a failure here is empty custom code, not a 500 on a sales page.
  if (error || !data) return NO_PAGE_SETTINGS;
  return camelize<PageSettings>(data);
}

export async function savePageSettings(
  owner: OwnerType,
  ownerId: string,
  input: PageSettings,
): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("page_settings").upsert(
    {
      store_id: await getStoreId(),
      owner_type: owner,
      owner_id: ownerId,
      custom_css: input.customCss,
      custom_js: input.customJs,
    },
    { onConflict: "owner_type,owner_id" },
  );
  if (error) throw new Error(`savePageSettings: ${error.message}`);
}

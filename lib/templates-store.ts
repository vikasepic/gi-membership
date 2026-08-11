import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { sanitizeSectionContent } from "@/lib/sanitize-html";
import { normalizeBlocks, type Block } from "@/lib/blocks";
import { normalizeSectionLayout, layoutIsDefault } from "@/lib/page-sections";
import { slugify } from "@/lib/slug";
import type { Template, TemplateBand } from "@/lib/templates/template";

// Templates the owner saved, as opposed to the ones that ship in code.
//
// Everything here mirrors how page_sections is handled, because a template IS
// page content that happens to be stored somewhere else: sanitized on the way
// in, normalized on the way out, and never trusted in between. A row someone
// wrote by hand has to be survivable by the reader.

export type SavedTemplate = Template & {
  /** Only a saved one has this. A built-in has no row to update. */
  savedId: string;
  updatedAt: string;
};

/** A stored row, made safe to render. */
function toTemplate(row: Record<string, unknown>): SavedTemplate {
  const name = String(row.name ?? "").trim() || "Untitled";
  const band = row.band && typeof row.band === "object" ? (row.band as TemplateBand) : undefined;
  return {
    // Prefixed, so a saved design and a built-in can never collide on id —
    // the popup keys off it and `listTemplates` hands back one list.
    id: `saved:${String(row.id)}`,
    savedId: String(row.id),
    name,
    group: String(row["group"] ?? "").trim() || "Saved",
    blocks: normalizeBlocks(row.blocks),
    ...(band ? { band } : {}),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function listSavedTemplates(): Promise<SavedTemplate[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("templates")
    .select("id, name, \"group\", blocks, band, updated_at")
    .eq("store_id", await getStoreId())
    .order("group")
    .order("name");
  if (error) throw new Error(`listSavedTemplates: ${error.message}`);
  return (data ?? []).map(toTemplate);
}

export async function getSavedTemplate(id: string): Promise<SavedTemplate | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("templates")
    .select("id, name, \"group\", blocks, band, updated_at")
    .eq("store_id", await getStoreId())
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getSavedTemplate: ${error.message}`);
  return data ? toTemplate(data) : null;
}

export type SaveTemplateInput = {
  /** Absent creates; present updates that row. */
  id?: string | null;
  name: string;
  group?: string | null;
  blocks: Block[];
  band?: TemplateBand | null;
};

/**
 * Write a design, and hand back its id.
 *
 * Sanitized through the same function a page save uses, so a template cannot
 * carry anything onto a page that a page would have refused — a template is
 * just page content waiting to be inserted, and it lands on a live sales page
 * the moment somebody picks it.
 */
export async function saveTemplate(input: SaveTemplateInput): Promise<string> {
  const db = createServiceClient();
  const name = input.name.trim() || "Untitled";
  const clean = sanitizeSectionContent({ blocks: input.blocks });
  const blocks = normalizeBlocks(clean.blocks);
  if (blocks.length === 0) throw new Error("A template with nothing in it is not a template.");

  // The band is stored only when it says something. A design that takes
  // whatever band it lands on keeps a null here, which is what a generic block
  // group wants and what `insertTemplate` reads as "change nothing".
  const band = input.band ?? null;
  const layout = band?.layout ? normalizeSectionLayout(band.layout) : null;
  const storedBand =
    band && (band.style || band.color !== undefined || (layout && !layoutIsDefault(layout)))
      ? { ...band, ...(layout && !layoutIsDefault(layout) ? { layout } : {}) }
      : null;

  const row = {
    store_id: await getStoreId(),
    name,
    group: (input.group ?? "").trim() || "Saved",
    blocks,
    band: storedBand,
  };

  if (input.id) {
    const { data, error } = await db
      .from("templates")
      .update(row)
      .eq("id", input.id)
      .eq("store_id", row.store_id)
      .select("id");
    if (error) throw new Error(`saveTemplate: ${error.message}`);
    if (!data || data.length === 0) throw new Error("That template is not there any more.");
    return String(data[0].id);
  }

  const { data, error } = await db.from("templates").insert(row).select("id").single();
  if (error) throw new Error(`saveTemplate: ${error.message}`);
  return String(data.id);
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db
    .from("templates")
    .delete()
    .eq("id", id)
    .eq("store_id", await getStoreId());
  if (error) throw new Error(`deleteTemplate: ${error.message}`);
}

/** A file name for the export, from the design's own name. */
export const templateFileName = (name: string): string => `${slugify(name) || "template"}.ts`;

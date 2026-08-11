import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { sanitizeSectionContent } from "@/lib/sanitize-html";
import { normalizeBlocks, type Block } from "@/lib/blocks";
import { normalizeSectionLayout, layoutIsDefault, type SectionRow } from "@/lib/page-sections";
import { slugify } from "@/lib/slug";
import { globalIdsIn, type GlobalBlocks } from "@/lib/section-to-blocks";
import type { Template, TemplateBand } from "@/lib/templates/template";

// Templates the owner saved, as opposed to the ones that ship in code.
//
// Everything here mirrors how page_sections is handled, because a template IS
// page content that happens to be stored somewhere else: sanitized on the way
// in, normalized on the way out, and never trusted in between. A row someone
// wrote by hand has to be survivable by the reader.

/**
 * Which kind of saved design a row is.
 *
 * `template` is a copy taken once: inserting it drops blocks the page owns.
 * `global` stays linked: the page stores a pointer, and editing the design
 * changes every page pointing at it.
 */
export type TemplateKind = "template" | "global";

export type SavedTemplate = Template & {
  /** Only a saved one has this. A built-in has no row to update. */
  savedId: string;
  kind: TemplateKind;
  updatedAt: string;
};

/** A stored row, made safe to render. */
function toTemplate(row: Record<string, unknown>): SavedTemplate {
  const name = String(row.name ?? "").trim() || "Untitled";
  const band = row.band && typeof row.band === "object" ? (row.band as TemplateBand) : undefined;
  const kind: TemplateKind = row.kind === "global" ? "global" : "template";
  return {
    // Prefixed, so a saved design and a built-in can never collide on id —
    // the popup keys off it and `listTemplates` hands back one list. The
    // prefix names the kind too, so a card knows what it is holding without a
    // second lookup.
    id: `${kind}:${String(row.id)}`,
    savedId: String(row.id),
    kind,
    name,
    group: String(row["group"] ?? "").trim() || "Saved",
    blocks: normalizeBlocks(row.blocks),
    ...(band ? { band } : {}),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function listSavedTemplates(kind: TemplateKind = "template"): Promise<SavedTemplate[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("templates")
    .select("id, name, \"group\", blocks, band, kind, updated_at")
    .eq("store_id", await getStoreId())
    .eq("kind", kind)
    .order("group")
    .order("name");
  if (error) throw new Error(`listSavedTemplates: ${error.message}`);
  return (data ?? []).map(toTemplate);
}

/** The designs pages link to, rather than copy. */
export const listGlobalBlocks = () => listSavedTemplates("global");

export async function getSavedTemplate(id: string): Promise<SavedTemplate | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("templates")
    .select("id, name, \"group\", blocks, band, kind, updated_at")
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
  /** Defaults to a copy-once template, which is what everything was. */
  kind?: TemplateKind;
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
    kind: input.kind ?? "template",
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

/**
 * The designs a page points at, ready for the renderer.
 *
 * One query for the whole page rather than one per pointer: a page with a
 * global header, footer and guarantee would otherwise be three round trips
 * before it could draw, on every request.
 *
 * Only rows that are actually globals resolve. A pointer at a row that has
 * since become a plain template resolves to nothing, and a pointer to nothing
 * renders nothing — the same answer a deleted design gets, which is the only
 * answer that keeps a live page whole.
 */
export async function resolveGlobals(rows: SectionRow[]): Promise<GlobalBlocks> {
  const ids = [
    ...new Set(
      rows.flatMap((row) => {
        const content = row.content as { blocks?: unknown } | null;
        return Array.isArray(content?.blocks) ? globalIdsIn(normalizeBlocks(content.blocks)) : [];
      }),
    ),
  ];
  if (ids.length === 0) return new Map();

  const db = createServiceClient();
  const { data, error } = await db
    .from("templates")
    .select("id, blocks")
    .eq("store_id", await getStoreId())
    .eq("kind", "global")
    .in("id", ids);
  // A page that cannot read its globals still renders everything else. The
  // alternative — throwing — takes down a sales page because a shared footer
  // could not be fetched.
  if (error) return new Map();
  return new Map((data ?? []).map((row) => [String(row.id), normalizeBlocks(row.blocks)]));
}

/** Where a global design is currently pointed at from. */
export type GlobalUsage = { owner: string; ownerId: string; sectionKey: string };

/**
 * Every section pointing at this design.
 *
 * Walked in application code rather than asked of Postgres. The obvious query
 * — `content @> '{"blocks":[{"props":{"globalId":"…"}}]}'` — only matches a
 * pointer at the TOP of a section: jsonb containment does not reach into a
 * row's columns. A global dropped inside a two-column row would be invisible
 * to it, and the delete below would cheerfully remove something live pages
 * were using. `walkBlocks` already descends into columns; this is a handful of
 * rows for one store, and correctness is worth more than a clever query.
 */
export async function globalUsage(id: string): Promise<GlobalUsage[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("page_sections")
    .select("owner_type, owner_id, section_key, content")
    .eq("store_id", await getStoreId());
  if (error) throw new Error(`globalUsage: ${error.message}`);
  const out: GlobalUsage[] = [];
  for (const row of data ?? []) {
    const content = row.content as { blocks?: unknown } | null;
    if (!content || !Array.isArray(content.blocks)) continue;
    if (globalIdsIn(normalizeBlocks(content.blocks)).includes(id)) {
      out.push({
        owner: String(row.owner_type),
        ownerId: String(row.owner_id),
        sectionKey: String(row.section_key),
      });
    }
  }
  return out;
}

/**
 * Remove a design, unless pages are pointing at it.
 *
 * A template can always go — inserting one made a copy, so nothing downstream
 * depends on the row. A global cannot, because deleting it would shorten
 * whatever pages link to it. The refusal names them, so the fix is obvious:
 * remove it from those pages, or unlink them.
 */
export async function deleteTemplate(id: string): Promise<void> {
  const db = createServiceClient();
  const existing = await getSavedTemplate(id);
  if (existing?.kind === "global") {
    const used = await globalUsage(id);
    if (used.length > 0) {
      const where = [...new Set(used.map((u) => `${u.owner} ${u.ownerId} (${u.sectionKey})`))];
      throw new Error(
        `Still used on ${used.length} section${used.length === 1 ? "" : "s"}: ${where.join(", ")}. Remove it there, or unlink those pages first.`,
      );
    }
  }
  const { error } = await db
    .from("templates")
    .delete()
    .eq("id", id)
    .eq("store_id", await getStoreId());
  if (error) throw new Error(`deleteTemplate: ${error.message}`);
}

/** A file name for the export, from the design's own name. */
export const templateFileName = (name: string): string => `${slugify(name) || "template"}.ts`;

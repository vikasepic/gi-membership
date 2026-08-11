"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { normalizeBlocks } from "@/lib/blocks";
import { deleteTemplate, saveTemplate, updateGlobalBlocks } from "@/lib/templates-store";
import type { TemplateBand } from "@/lib/templates/template";

// Saving a design the owner built, and removing one they no longer want.
//
// Guarded like every other admin write: a template lands on a live sales page
// the moment somebody inserts it, so it is page content and gets page
// content's rules.

type Result = { error?: string; id?: string };

const jsonObject = (value: FormDataEntryValue | null): Record<string, unknown> | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

export async function saveTemplateAction(_prev: Result, formData: FormData): Promise<Result> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give it a name — it is how you will find it again." };

  let blocks;
  try {
    blocks = normalizeBlocks(JSON.parse(String(formData.get("blocks") ?? "[]")));
  } catch {
    return { error: "That design could not be read." };
  }
  if (blocks.length === 0) return { error: "There is nothing in this design to save." };

  try {
    const id = await saveTemplate({
      id: String(formData.get("id") ?? "").trim() || null,
      name,
      group: String(formData.get("group") ?? "").trim() || null,
      blocks,
      band: (jsonObject(formData.get("band")) as TemplateBand | null) ?? null,
      // Which shelf. Anything unrecognised is a plain template, which is the
      // safe answer: a copy is nobody's dependency.
      kind: String(formData.get("kind") ?? "") === "global" ? "global" : "template",
    });
    revalidatePath("/admin/templates");
    return { id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That did not save." };
  }
}

/**
 * Save a global design edited from inside the builder.
 *
 * Its own action rather than a flag on the one above, because it means
 * something different: this writes to a row other pages are reading, so the
 * next render of every one of them changes. Nothing is revalidated here beyond
 * the templates screen — the pages using it are dynamic and read the design
 * fresh, and listing them to revalidate would be the same walk the delete
 * guard does, on every keystroke-adjacent save.
 */
export async function saveGlobalBlocksAction(_prev: Result, formData: FormData): Promise<Result> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Nothing to save to." };
  let blocks;
  try {
    blocks = normalizeBlocks(JSON.parse(String(formData.get("blocks") ?? "[]")));
  } catch {
    return { error: "That design could not be read." };
  }
  try {
    await updateGlobalBlocks(id, blocks);
    revalidatePath("/admin/templates");
    return { id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That did not save." };
  }
}

export async function deleteTemplateAction(_prev: Result, formData: FormData): Promise<Result> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Nothing to remove." };
  try {
    await deleteTemplate(id);
    revalidatePath("/admin/templates");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That did not delete." };
  }
}

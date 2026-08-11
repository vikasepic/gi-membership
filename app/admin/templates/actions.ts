"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { normalizeBlocks } from "@/lib/blocks";
import { deleteTemplate, saveTemplate } from "@/lib/templates-store";
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
    });
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

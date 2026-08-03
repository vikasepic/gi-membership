"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { saveSection, seedPage, type OwnerType } from "@/lib/pages";
import { sectionDef } from "@/lib/page-sections";
import { uploadPageImage, validateUpload } from "@/lib/media";

export type SectionSaveState = { error?: string; savedKey?: string };

/**
 * Save one section of one page.
 *
 * The whole form posts, but only the named section is written — which is the
 * point. Two people editing different sections cannot overwrite each other.
 */
export async function saveSectionAction(
  _prev: SectionSaveState,
  formData: FormData,
): Promise<SectionSaveState> {
  await requireAdmin();

  const owner = String(formData.get("ownerType") ?? "") as OwnerType;
  const ownerId = String(formData.get("ownerId") ?? "");
  const sectionKey = String(formData.get("sectionKey") ?? "");
  if (owner !== "product" && owner !== "offer") return { error: "Bad owner." };
  if (!ownerId || !sectionDef(sectionKey)) return { error: "Unknown section." };

  let content: Record<string, unknown> = {};
  try {
    const raw = String(formData.get("content") ?? "{}");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) content = parsed;
  } catch {
    return { error: "Could not read the section's content." };
  }

  try {
    await saveSection(owner, ownerId, sectionKey, {
      enabled: String(formData.get("enabled") ?? "true") === "true",
      style: String(formData.get("style") ?? ""),
      accent: String(formData.get("accent") ?? "").trim() || null,
      variant: String(formData.get("variant") ?? "").trim() || null,
      content,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save." };
  }

  revalidatePath(`/admin/${owner === "offer" ? "offers" : "products"}/${ownerId}/page`);
  revalidatePath("/p", "layout");
  revalidatePath("/checkout/oto");
  return { savedKey: sectionKey };
}

export async function enablePageAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const owner = String(formData.get("ownerType") ?? "") as OwnerType;
  const ownerId = String(formData.get("ownerId") ?? "");
  if ((owner !== "product" && owner !== "offer") || !ownerId) return;
  await seedPage(owner, ownerId);
  revalidatePath(`/admin/${owner === "offer" ? "offers" : "products"}/${ownerId}/page`);
}

export type ImageUploadState = { ok?: boolean; path?: string; error?: string };

/**
 * Upload one image for a section and hand back its path.
 *
 * Called directly from the file input's change handler rather than through a
 * form: the section editor is already a form, and a form cannot contain
 * another one. The path goes into the draft and is persisted by the section's
 * own save, like every other field on the screen.
 */
export async function uploadSectionImageAction(formData: FormData): Promise<ImageUploadState> {
  await requireAdmin();
  const owner = String(formData.get("ownerType") ?? "") as OwnerType;
  const ownerId = String(formData.get("ownerId") ?? "");
  const file = formData.get("file");
  if (owner !== "product" && owner !== "offer") return { error: "Bad owner." };
  if (!ownerId) return { error: "Missing page." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image." };

  const check = validateUpload({ type: file.type, size: file.size }, "cover");
  if (!check.ok) return { error: check.error };

  try {
    return { ok: true, path: await uploadPageImage(owner, ownerId, file) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed." };
  }
}

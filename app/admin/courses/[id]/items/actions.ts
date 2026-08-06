"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import {
  addAttachment,
  createItem,
  deleteItem,
  moveItem,
  moveItemTo,
  removeAttachment,
  setChapterPublished,
  setCover,
  setItemPublished,
  setItemTitle,
  updateItem,
} from "@/lib/curriculum-admin";
import { validateUpload, uploadAttachment, uploadCover, pickedFile } from "@/lib/media";
import type { ItemType } from "@/lib/curriculum";

const ITEM_TYPES: ItemType[] = ["video", "audio", "pdf", "text"];
const asItemType = (v: FormDataEntryValue | null): ItemType =>
  ITEM_TYPES.includes(v as ItemType) ? (v as ItemType) : "text";

const raw = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v : null;
};

export async function addChapterAction(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const id = await createItem(courseId, null, {
    itemType: "text",
    title: String(formData.get("title") || "Untitled"),
    subtitle: null,
    bodyHtml: null,
    videoEmbedUrl: null,
    audioUrls: [],
    isPublished: false,
  });
  revalidatePath(`/admin/courses/${courseId}`);
  redirect(`/admin/courses/${courseId}/items/${id}`);
}

export async function addLessonAction(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const parentId = String(formData.get("parentId"));
  const id = await createItem(courseId, parentId, {
    itemType: asItemType(formData.get("itemType")),
    title: String(formData.get("title") || "Untitled"),
    subtitle: null,
    bodyHtml: null,
    videoEmbedUrl: null,
    audioUrls: [],
    isPublished: false,
  });
  revalidatePath(`/admin/courses/${courseId}`);
  redirect(`/admin/courses/${courseId}/items/${id}`);
}

export async function moveItemAction(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  await moveItem(String(formData.get("itemId")), formData.get("dir") === "up" ? "up" : "down");
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function deleteItemAction(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  await deleteItem(String(formData.get("itemId")));
  revalidatePath(`/admin/courses/${courseId}`);
  redirect(`/admin/courses/${courseId}`);
}

export async function saveItemAction(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const itemId = String(formData.get("itemId"));
  await updateItem(itemId, {
    itemType: asItemType(formData.get("itemType")),
    title: String(formData.get("title") || "Untitled"),
    subtitle: raw(formData, "subtitle"),
    bodyHtml: raw(formData, "bodyHtml"),
    videoEmbedUrl: raw(formData, "videoEmbedUrl"),
    // getAll: the editor renders one input per link, all named the same.
    audioUrls: formData
      .getAll("audioUrls")
      .map((v) => String(v).trim())
      .filter(Boolean),
    isPublished: formData.get("isPublished") === "on",
  });
  revalidatePath(`/admin/courses/${courseId}/items/${itemId}`);
  revalidatePath(`/admin/courses/${courseId}`);
  redirect(`/admin/courses/${courseId}`);
}

export async function uploadCoverAction(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const itemId = String(formData.get("itemId"));
  const base = `/admin/courses/${courseId}/items/${itemId}`;
  const chosen = await pickedFile(formData, "cover");
  if (!chosen.ok) redirect(`${base}?error=${encodeURIComponent(chosen.error)}`);
  const file = formData.get("file");
  if (!chosen.picked && (!(file instanceof File) || file.size === 0)) {
    redirect(`${base}?error=${encodeURIComponent("Choose a file")}`);
  }
  if (!chosen.picked) {
    const f = file as File;
    const check = validateUpload({ type: f.type, size: f.size }, "cover");
    if (!check.ok) redirect(`${base}?error=${encodeURIComponent(check.error)}`);
  }
  await setCover(itemId, chosen.picked ? chosen.picked.path : await uploadCover(itemId, file as File));
  revalidatePath(base);
}

export async function uploadAttachmentAction(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const itemId = String(formData.get("itemId"));
  const base = `/admin/courses/${courseId}/items/${itemId}`;
  const chosen = await pickedFile(formData, "attachment");
  if (!chosen.ok) redirect(`${base}?error=${encodeURIComponent(chosen.error)}`);
  const file = formData.get("file");
  if (!chosen.picked && (!(file instanceof File) || file.size === 0)) {
    redirect(`${base}?error=${encodeURIComponent("Choose a file")}`);
  }
  if (!chosen.picked) {
    const f = file as File;
    const check = validateUpload({ type: f.type, size: f.size }, "attachment");
    if (!check.ok) redirect(`${base}?error=${encodeURIComponent(check.error)}`);
  }
  await addAttachment(itemId, chosen.picked ?? (await uploadAttachment(itemId, file as File)));
  revalidatePath(base);
}

export async function removeAttachmentAction(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const itemId = String(formData.get("itemId"));
  await removeAttachment(itemId, String(formData.get("path")));
  revalidatePath(`/admin/courses/${courseId}/items/${itemId}`);
}

export type ItemUploadState = { ok?: boolean; error?: string };

/**
 * Upload one file for a lesson and report back, rather than redirecting.
 *
 * uploadAttachmentAction redirects, which is right for its own form but wrong
 * here: this one is called straight from a change handler so the control can
 * sit inside the media panel it belongs to. The save form already wraps that
 * panel, and a form cannot contain another form.
 */
export async function uploadItemFileAction(formData: FormData): Promise<ItemUploadState> {
  await requireAdmin();
  const itemId = String(formData.get("itemId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  if (!itemId || !courseId) return { error: "Missing lesson." };

  const chosen = await pickedFile(formData, "attachment");
  if (!chosen.ok) return { error: chosen.error };

  const file = formData.get("file");
  if (!chosen.picked && (!(file instanceof File) || file.size === 0)) {
    return { error: "Choose a file." };
  }
  if (!chosen.picked) {
    const f = file as File;
    const check = validateUpload({ type: f.type, size: f.size }, "attachment");
    if (!check.ok) return { error: check.error };
  }

  try {
    await addAttachment(itemId, chosen.picked ?? (await uploadAttachment(itemId, file as File)));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed." };
  }
  revalidatePath(`/admin/courses/${courseId}/items/${itemId}`);
  return { ok: true };
}

/**
 * Drag to a position, and possibly into another chapter.
 *
 * The whole destination order is decided in the browser and the finished
 * position is sent — rather than a stream of up/down steps, which is what the
 * buttons did and what made a drag impossible to express.
 */
export async function moveItemToAction(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const parent = String(formData.get("parentId") ?? "");
  await moveItemTo(
    String(formData.get("itemId")),
    parent === "" ? null : parent,
    Number(formData.get("index") ?? 0),
  );
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function setPublishedAction(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const on = String(formData.get("published")) === "true";
  const scope = String(formData.get("scope") ?? "item");
  const itemId = String(formData.get("itemId"));
  if (scope === "chapter") await setChapterPublished(itemId, on);
  else await setItemPublished(itemId, on);
  revalidatePath(`/admin/courses/${courseId}`);
}

export async function renameItemAction(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  await setItemTitle(String(formData.get("itemId")), String(formData.get("title") ?? ""));
  revalidatePath(`/admin/courses/${courseId}`);
}

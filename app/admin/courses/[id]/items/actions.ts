"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import {
  createItem,
  moveItem,
  deleteItem,
  updateItem,
  addAttachment,
  removeAttachment,
  setCover,
} from "@/lib/curriculum-admin";
import { validateUpload, uploadAttachment, uploadCover } from "@/lib/media";
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
    audioUrl: null,
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
    audioUrl: null,
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
    audioUrl: raw(formData, "audioUrl"),
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
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${base}?error=${encodeURIComponent("Choose a file")}`);
  }
  const check = validateUpload({ type: file.type, size: file.size }, "cover");
  if (!check.ok) redirect(`${base}?error=${encodeURIComponent(check.error)}`);
  await setCover(itemId, await uploadCover(itemId, file));
  revalidatePath(base);
}

export async function uploadAttachmentAction(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const itemId = String(formData.get("itemId"));
  const base = `/admin/courses/${courseId}/items/${itemId}`;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${base}?error=${encodeURIComponent("Choose a file")}`);
  }
  const check = validateUpload({ type: file.type, size: file.size }, "attachment");
  if (!check.ok) redirect(`${base}?error=${encodeURIComponent(check.error)}`);
  await addAttachment(itemId, await uploadAttachment(itemId, file));
  revalidatePath(base);
}

export async function removeAttachmentAction(formData: FormData) {
  await requireAdmin();
  const courseId = String(formData.get("courseId"));
  const itemId = String(formData.get("itemId"));
  await removeAttachment(itemId, String(formData.get("path")));
  revalidatePath(`/admin/courses/${courseId}/items/${itemId}`);
}

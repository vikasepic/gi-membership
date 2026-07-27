"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { createItem, moveItem, deleteItem, updateItem, addAttachment, removeAttachment } from "@/lib/curriculum-admin";
import { validateUpload, uploadAttachment } from "@/lib/media";

export async function addChapterAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId"));
  const title = String(formData.get("title") || "Untitled");
  const id = await createItem(productId, null, {
    title,
    subtitle: null,
    bodyHtml: null,
    videoEmbedUrl: null,
    isPublished: false,
  });
  revalidatePath(`/admin/products/${productId}`);
  redirect(`/admin/products/${productId}/curriculum/${id}`);
}

export async function addLessonAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId"));
  const parentId = String(formData.get("parentId"));
  const id = await createItem(productId, parentId, {
    title: String(formData.get("title") || "Untitled"),
    subtitle: null,
    bodyHtml: null,
    videoEmbedUrl: null,
    isPublished: false,
  });
  revalidatePath(`/admin/products/${productId}`);
  redirect(`/admin/products/${productId}/curriculum/${id}`);
}

export async function moveItemAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId"));
  await moveItem(String(formData.get("itemId")), formData.get("dir") === "up" ? "up" : "down");
  revalidatePath(`/admin/products/${productId}`);
}

export async function deleteItemAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId"));
  await deleteItem(String(formData.get("itemId")));
  revalidatePath(`/admin/products/${productId}`);
  redirect(`/admin/products/${productId}`);
}

export async function saveItemAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId"));
  const itemId = String(formData.get("itemId"));
  const raw = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() !== "" ? v : null;
  };
  await updateItem(itemId, {
    title: String(formData.get("title") || "Untitled"),
    subtitle: raw("subtitle"),
    bodyHtml: raw("bodyHtml"),
    videoEmbedUrl: raw("videoEmbedUrl"),
    isPublished: formData.get("isPublished") === "on",
  });
  revalidatePath(`/admin/products/${productId}/curriculum/${itemId}`);
  revalidatePath(`/admin/products/${productId}`);
  redirect(`/admin/products/${productId}`);
}

export async function uploadAttachmentAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId"));
  const itemId = String(formData.get("itemId"));
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const check = validateUpload({ type: file.type, size: file.size }, "attachment");
    if (check.ok) await addAttachment(itemId, await uploadAttachment(itemId, file));
  }
  revalidatePath(`/admin/products/${productId}/curriculum/${itemId}`);
}

export async function removeAttachmentAction(formData: FormData) {
  await requireAdmin();
  const productId = String(formData.get("productId"));
  const itemId = String(formData.get("itemId"));
  await removeAttachment(itemId, String(formData.get("path")));
  revalidatePath(`/admin/products/${productId}/curriculum/${itemId}`);
}

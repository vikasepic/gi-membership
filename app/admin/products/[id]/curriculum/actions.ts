"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { createItem, moveItem, deleteItem } from "@/lib/curriculum-admin";

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

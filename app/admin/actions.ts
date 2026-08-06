"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createProduct, updateProduct, deleteProduct, uploadPaidAsset,
  setProductCover, clearProductCover,
} from "@/lib/admin";
import { requireAdmin } from "@/lib/admin-guard";
import { setProductCourses } from "@/lib/courses";
import { blocksPublish, PUBLISH_WITHOUT_COURSE_ERROR, parseProductForm } from "@/lib/product-rules";
import { validateUpload, uploadProductCover, pickedFile } from "@/lib/media";

// Errors are keyed by field so the form can show each one next to its own input
// and never reload. `_form` carries anything not tied to a single field.
export type SaveState = { errors?: Record<string, string> };

export async function saveProduct(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireAdmin();

  const parsed = parseProductForm(Object.fromEntries(formData));
  if (!parsed.ok) return { errors: parsed.errors };
  const { id, ...input } = parsed.data;

  // Which courses this product unlocks. The library delivers courses and nothing
  // else, so a published product with no course is one a buyer can pay for and
  // never receive. Refuse to publish it rather than sell a dead end; drafts may
  // sit courseless while they're being built.
  const courseIds = formData.getAll("courseIds").map(String).filter(Boolean);
  if (blocksPublish(input.status, courseIds)) {
    return { errors: { courseIds: PUBLISH_WITHOUT_COURSE_ERROR } };
  }

  let productId: string;
  try {
    productId = id ? (await updateProduct(id, input), id) : await createProduct(input);
    await setProductCourses(productId, courseIds);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Save failed";
    // A duplicate slug is a unique-constraint violation (Postgres 23505). Point
    // it at the slug field instead of surfacing a raw database error.
    if (/duplicate key|already exists|23505/i.test(message)) {
      return { errors: { slug: "That slug is already taken — try another." } };
    }
    return { errors: { _form: message } };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  redirect(`/admin/products/${productId}`);
}

const MAX_ASSET_BYTES = 100 * 1024 * 1024; // 100MB

export type UploadState = { error?: string; path?: string };

export async function uploadAsset(_prev: UploadState, formData: FormData): Promise<UploadState> {
  await requireAdmin();
  const productId = formData.get("productId");
  const file = formData.get("file");
  if (typeof productId !== "string" || !productId) return { error: "Missing product" };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file" };
  if (file.size > MAX_ASSET_BYTES) return { error: "File too large (max 100MB)" };
  const type = file.type || "";
  const ok = type === "application/pdf" || type.startsWith("audio/");
  if (!ok) return { error: "Only PDF or audio files" };

  try {
    const path = await uploadPaidAsset(productId, file);
    revalidatePath(`/admin/products/${productId}`);
    return { path };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
}

export async function removeProduct(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id");
  if (typeof id === "string" && id) {
    await deleteProduct(id);
    revalidatePath("/");
    revalidatePath("/admin");
  }
  redirect("/admin");
}

export type CoverState = { error?: string; ok?: boolean };

// Storefront image for one product. Optional: without it the product shows its
// course's cover, which is the right default for a single-course product. A
// bundle, or a listing that wants its own artwork, sets one here.
export async function uploadProductCoverAction(
  _prev: CoverState,
  formData: FormData,
): Promise<CoverState> {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return { error: "Missing product." };

  // Already in the library: no second copy of the same photo under a second
  // name, which is the whole reason the library exists.
  const chosen = await pickedFile(formData, "cover");
  if (!chosen.ok) return { error: chosen.error };

  const file = formData.get("file");
  if (!chosen.picked && (!(file instanceof File) || file.size === 0)) {
    return { error: "Choose an image." };
  }
  if (!chosen.picked) {
    const f = file as File;
    const check = validateUpload({ type: f.type, size: f.size }, "cover");
    if (!check.ok) return { error: check.error };
  }
  try {
    const path = chosen.picked
      ? chosen.picked.path
      : await uploadProductCover(productId, file as File);
    await setProductCover(productId, path);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed" };
  }
  revalidatePath("/");
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

export async function clearProductCoverAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  if (productId) {
    await clearProductCover(productId);
    revalidatePath("/");
    revalidatePath(`/admin/products/${productId}`);
  }
}

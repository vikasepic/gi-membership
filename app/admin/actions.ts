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
export type SaveState = { errors?: Record<string, string>; saved?: boolean };

export async function saveProduct(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireAdmin();

  const parsed = parseProductForm(Object.fromEntries(formData));
  if (!parsed.ok) return { errors: parsed.errors };
  const { id, ...input } = parsed.data;

  // getAll, not fromEntries: a repeated field collapses to its last value, so
  // four bullets would have arrived as one.
  const checkoutBullets = formData
    .getAll("checkoutBullets")
    .map((v) => String(v).trim())
    .filter(Boolean);

  // Which courses this product unlocks. The library delivers courses and nothing
  // else, so a published product with no course is one a buyer can pay for and
  // never receive. Refuse to publish it rather than sell a dead end; drafts may
  // sit courseless while they're being built.
  const courseIds = formData.getAll("courseIds").map(String).filter(Boolean);
  if (blocksPublish(input.status, courseIds)) {
    return { errors: { courseIds: PUBLISH_WITHOUT_COURSE_ERROR } };
  }

  // The cover posts with everything else now. It used to be its own form,
  // uploading the moment a file was chosen, which is why it needed a card of
  // its own and could not sit inside the tabs. A picked file already exists in
  // the library, so there is nothing to upload here — only a path to record.
  const chosen = await pickedFile(formData, "cover");
  if (!chosen.ok) return { errors: { cover: chosen.error } };
  const clearCover = String(formData.get("clearCover") ?? "") === "1";

  let productId: string;
  try {
    const withCopy = { ...input, checkoutBullets };
    productId = id ? (await updateProduct(id, withCopy), id) : await createProduct(withCopy);
    await setProductCourses(productId, courseIds);
    if (clearCover) await clearProductCover(productId);
    else if (chosen.picked) await setProductCover(productId, chosen.picked.path);
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

  // Only a new product goes anywhere. Redirecting an update to the page it is
  // already on re-renders everything to arrive where it started, and leaves the
  // button saying "Saving…" for the length of it — which is the difference
  // between a save that worked and a save that looks broken.
  if (!id) redirect(`/admin/products/${productId}`);
  revalidatePath(`/admin/products/${productId}`);
  return { saved: true };
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

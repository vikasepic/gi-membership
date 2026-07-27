"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createProduct, updateProduct, deleteProduct, uploadPaidAsset, type ProductInput } from "@/lib/admin";
import { requireAdmin } from "@/lib/admin-guard";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

// Accept any Postgres uuid shape — not just RFC-4122 v1-8. zod's .uuid()
// enforces version/variant bits, which rejects deterministic seed ids like
// 00000000-…-0000000000c1 that Postgres stores fine.
const uuidish = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid id");

const schema = z.object({
  id: uuidish.optional().or(z.literal("").transform(() => undefined)),
  slug: z.string().trim().min(1, "Slug required").regex(/^[a-z0-9-]+$/, "lowercase, numbers, hyphens only"),
  title: z.string().trim().min(1, "Title required"),
  tagline: z.preprocess(emptyToNull, z.string().nullable()),
  description: z.preprocess(emptyToNull, z.string().nullable()),
  type: z.enum(["pdf", "audio", "video", "app", "course"]),
  // dollars from the form -> cents
  price: z.coerce.number().min(0, "Price must be ≥ 0"),
  compareAt: z.preprocess(emptyToNull, z.coerce.number().min(0).nullable()),
  mediaMode: z.preprocess(emptyToNull, z.enum(["upload", "embed"]).nullable()),
  mediaEmbedUrl: z.preprocess(emptyToNull, z.string().url("Must be a URL").nullable()),
  coverImageUrl: z.preprocess(emptyToNull, z.string().url("Must be a URL").nullable()),
  status: z.enum(["draft", "published"]),
  bumpOfferId: z.preprocess(emptyToNull, uuidish.nullable()),
  upsellOfferId: z.preprocess(emptyToNull, uuidish.nullable()),
  chapterLabel: z.string().trim().min(1).default("Chapter"),
  lessonLabel: z.string().trim().min(1).default("Lesson"),
});

export type SaveState = { error?: string };

export async function saveProduct(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const v = parsed.data;
  const input: ProductInput = {
    slug: v.slug,
    title: v.title,
    tagline: v.tagline,
    description: v.description,
    type: v.type,
    priceCents: Math.round(v.price * 100),
    compareAtCents: v.compareAt == null ? null : Math.round(v.compareAt * 100),
    mediaMode: v.mediaMode,
    mediaEmbedUrl: v.mediaEmbedUrl,
    coverImageUrl: v.coverImageUrl,
    status: v.status,
    bumpOfferId: v.bumpOfferId,
    upsellOfferId: v.upsellOfferId,
    chapterLabel: v.chapterLabel,
    lessonLabel: v.lessonLabel,
  };

  try {
    if (v.id) await updateProduct(v.id, input);
    else await createProduct(input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Save failed" };
  }

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
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

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import type { Attachment } from "@/lib/curriculum";

// Covers are marketing imagery shown before purchase -> PUBLIC bucket.
// Attachments and inline lesson images are paid content -> PRIVATE bucket,
// reachable only through the ownership-gated route.
const COVER_MAX = 5 * 1024 * 1024;
const ATTACH_MAX = 100 * 1024 * 1024;
const ATTACH_TYPES = [
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function validateUpload(
  file: { type: string; size: number },
  kind: "cover" | "attachment",
): { ok: true } | { ok: false; error: string } {
  if (!file.size) return { ok: false, error: "File is empty" };
  if (kind === "cover") {
    if (!file.type.startsWith("image/")) return { ok: false, error: "Cover must be an image" };
    if (file.size > COVER_MAX) return { ok: false, error: "Cover must be under 5MB" };
    return { ok: true };
  }
  if (!ATTACH_TYPES.includes(file.type)) return { ok: false, error: "Unsupported file type" };
  if (file.size > ATTACH_MAX) return { ok: false, error: "File must be under 100MB" };
  return { ok: true };
}

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]/g, "_");

export function publicCoverUrl(coverPath: string | null): string | null {
  if (!coverPath) return null;
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public-media/${coverPath}`;
}

export async function uploadCover(itemId: string, file: File): Promise<string> {
  const db = createServiceClient();
  const path = `items/${itemId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await db.storage.from("public-media").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`uploadCover: ${error.message}`);
  return path;
}

export async function uploadAttachment(itemId: string, file: File): Promise<Attachment> {
  const db = createServiceClient();
  const path = `items/${itemId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await db.storage.from("paid-assets").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`uploadAttachment: ${error.message}`);
  return { path, name: file.name, size: file.size, mime: file.type };
}

export async function signedItemAsset(path: string, ttl = 60): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db.storage.from("paid-assets").createSignedUrl(path, ttl);
  return data?.signedUrl ?? null;
}

// Course-level uploads, for a course that holds its content directly (no
// chapters). Same buckets and rules as the item versions — cover is public,
// the file is a paid asset — just filed under courses/ instead of items/.
export async function uploadCourseCover(courseId: string, file: File): Promise<string> {
  const db = createServiceClient();
  const path = `courses/${courseId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await db.storage.from("public-media").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`uploadCourseCover: ${error.message}`);
  return path;
}

export async function uploadProductCover(productId: string, file: File): Promise<string> {
  const db = createServiceClient();
  const path = `products/${productId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await db.storage.from("public-media").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`uploadProductCover: ${error.message}`);
  return path;
}

/**
 * An image for a sales-page section.
 *
 * Public bucket, like every other cover: this is marketing artwork shown to
 * anyone who loads the page. Paid assets stay in the private bucket and are
 * only ever served through an ownership-checked signed URL.
 */
export async function uploadPageImage(
  owner: "product" | "offer",
  ownerId: string,
  file: File,
): Promise<string> {
  const db = createServiceClient();
  const path = `pages/${owner}/${ownerId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await db.storage.from("public-media").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`uploadPageImage: ${error.message}`);
  return path;
}

export async function uploadCourseAttachment(courseId: string, file: File): Promise<Attachment> {
  const db = createServiceClient();
  const path = `courses/${courseId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await db.storage.from("paid-assets").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`uploadCourseAttachment: ${error.message}`);
  return { path, name: file.name, size: file.size, mime: file.type };
}

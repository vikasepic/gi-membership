import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import type { Attachment } from "@/lib/curriculum";
import sharp from "sharp";
import { COVER_WIDTH, COVER_HEIGHT } from "@/lib/cover";

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

/** How wide a sales-page image can usefully be — full-bleed on a large screen. */
const PAGE_WIDTH = 2000;

/**
 * Shrink an image to the largest size anything actually displays it at.
 *
 * The upload limit was 5MB, and whatever was uploaded is what every visitor
 * downloaded — a 4MB phone photo behind a card 400px wide, on a phone, on
 * mobile data. Doing it here rather than in the browser means it applies to
 * every route that takes an image, including the ones added later, and the
 * limit stops mattering: bring a 5MB photo and 200KB gets stored.
 *
 * Never enlarged, so a small image is left exactly as it is rather than being
 * blown up into something blurrier than what arrived. WebP because it is a
 * third of the size of the same JPEG and every browser has read it for years —
 * and unlike JPEG it keeps transparency, so a logo with a cut-out background
 * does not gain a black one.
 */
async function shrink(
  file: File,
  maxWidth: number,
  maxHeight?: number,
): Promise<{ body: Buffer; contentType: string; ext: string } | null> {
  try {
    const out = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate() // honour the EXIF orientation before it is stripped, or a photo taken sideways stays sideways
      .resize({ width: maxWidth, height: maxHeight, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { body: out, contentType: "image/webp", ext: "webp" };
  } catch (e) {
    // An image sharp cannot read — an exotic format, or something claiming to
    // be an image and not being one. Storing the original is the same behaviour
    // as before this existed; refusing the upload over it is not.
    console.error("[shrink] leaving the original as it is:", e);
    return null;
  }
}

/** Upload an image to the public bucket, shrunk to what is actually displayed. */
async function putImage(path: string, file: File, maxWidth: number, maxHeight?: number) {
  const db = createServiceClient();
  const small = await shrink(file, maxWidth, maxHeight);
  const finalPath = small ? `${path}.${small.ext}` : path;
  const { error } = await db.storage
    .from("public-media")
    .upload(finalPath, small ? small.body : file, {
      contentType: small ? small.contentType : file.type,
      upsert: false,
    });
  return { finalPath, error };
}

export function publicCoverUrl(coverPath: string | null): string | null {
  if (!coverPath) return null;
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public-media/${coverPath}`;
}

export async function uploadCover(itemId: string, file: File): Promise<string> {
  const { finalPath, error } = await putImage(
    `items/${itemId}/${Date.now()}-${safeName(file.name)}`,
    file,
    COVER_WIDTH,
    COVER_HEIGHT,
  );
  if (error) throw new Error(`uploadCover: ${error.message}`);
  return finalPath;
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
  const { finalPath, error } = await putImage(
    `courses/${courseId}/${Date.now()}-${safeName(file.name)}`,
    file,
    COVER_WIDTH,
    COVER_HEIGHT,
  );
  if (error) throw new Error(`uploadCourseCover: ${error.message}`);
  return finalPath;
}

export async function uploadProductCover(productId: string, file: File): Promise<string> {
  const { finalPath, error } = await putImage(
    `products/${productId}/${Date.now()}-${safeName(file.name)}`,
    file,
    COVER_WIDTH,
    COVER_HEIGHT,
  );
  if (error) throw new Error(`uploadProductCover: ${error.message}`);
  return finalPath;
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
  // Wider than a cover: this one can run full-bleed across a large screen.
  const { finalPath, error } = await putImage(
    `pages/${owner}/${ownerId}/${Date.now()}-${safeName(file.name)}`,
    file,
    PAGE_WIDTH,
  );
  if (error) throw new Error(`uploadPageImage: ${error.message}`);
  return finalPath;
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

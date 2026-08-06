import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import type { Attachment } from "@/lib/curriculum";
import sharp from "sharp";
import { COVER_WIDTH, COVER_HEIGHT } from "@/lib/cover";
import { recordMedia, getMedia } from "@/lib/media-library";

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

/**
 * Upload straight into the library, belonging to nothing yet.
 *
 * Every other upload here is filed under whatever it was for — items/<id>,
 * products/<id> — which made sense when a file WAS a property of that thing.
 * A file chosen from a modal is not for anything in particular at the moment
 * it arrives, and may end up used in three places, so it is filed under
 * library/ and pointed at.
 */
export async function uploadToLibrary(
  file: File,
  kind: "cover" | "attachment",
): Promise<Attachment> {
  const stamped = `library/${Date.now()}-${safeName(file.name)}`;
  if (kind === "cover") {
    const { finalPath, error } = await putImage(stamped, file, PAGE_WIDTH);
    if (error) throw new Error(`uploadToLibrary: ${error.message}`);
    return { path: finalPath, name: file.name, size: file.size, mime: "image/webp" };
  }
  const db = createServiceClient();
  const { error } = await db.storage.from("paid-assets").upload(stamped, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`uploadToLibrary: ${error.message}`);
  await recordMedia({
    bucket: "paid-assets",
    path: stamped,
    filename: file.name,
    mime: file.type,
    size: file.size,
  });
  return { path: stamped, name: file.name, size: file.size, mime: file.type };
}

/**
 * A file the person chose from the library instead of uploading.
 *
 * Returns null when they uploaded one, which is still the common case — the
 * two live side by side in every form rather than one replacing the other.
 *
 * The bucket check is not bookkeeping. A cover is shown to anyone who loads the
 * page, so it can only come from the public bucket; a lesson attachment is
 * something people paid for, so it can only come from the private one. Getting
 * that backwards would either publish paid content or put an image on a sales
 * page that 404s for every visitor.
 */
export async function pickedFile(
  formData: FormData,
  kind: "cover" | "attachment",
): Promise<{ ok: true; picked: Attachment | null } | { ok: false; error: string }> {
  const id = String(formData.get("mediaId") ?? "");
  if (!id) return { ok: true, picked: null };
  const row = await getMedia(id);
  if (!row) return { ok: false, error: "That file is no longer in the library." };
  if (kind === "cover") {
    if (!row.mime.startsWith("image/")) return { ok: false, error: "A cover has to be an image." };
    if (row.bucket !== "public-media") {
      return { ok: false, error: "That file is paid content, so it cannot be a public cover." };
    }
  } else if (row.bucket !== "paid-assets") {
    return { ok: false, error: "That file is public artwork, not a lesson file." };
  }
  return { ok: true, picked: { path: row.path, name: row.name, size: row.size, mime: row.mime } };
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
): Promise<{ body: Buffer; contentType: string; ext: string; width: number; height: number } | null> {
  try {
    const out = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate() // honour the EXIF orientation before it is stripped, or a photo taken sideways stays sideways
      .resize({ width: maxWidth, height: maxHeight, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return {
      body: out.data,
      contentType: "image/webp",
      ext: "webp",
      // Its real size after the resize, so the library can show it without
      // fetching the file back to measure it.
      width: out.info.width,
      height: out.info.height,
    };
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
  if (!error) {
    await recordMedia({
      bucket: "public-media",
      path: finalPath,
      filename: file.name,
      mime: small ? small.contentType : file.type,
      size: small ? small.body.byteLength : file.size,
      width: small?.width,
      height: small?.height,
    });
  }
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
  await recordMedia({
    bucket: "paid-assets",
    path,
    filename: file.name,
    mime: file.type,
    size: file.size,
  });
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


export async function uploadCourseAttachment(courseId: string, file: File): Promise<Attachment> {
  const db = createServiceClient();
  const path = `courses/${courseId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await db.storage.from("paid-assets").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`uploadCourseAttachment: ${error.message}`);
  await recordMedia({
    bucket: "paid-assets",
    path,
    filename: file.name,
    mime: file.type,
    size: file.size,
  });
  return { path, name: file.name, size: file.size, mime: file.type };
}

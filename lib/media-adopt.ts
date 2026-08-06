import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { recordMedia } from "@/lib/media-library";

/**
 * Everything already in the buckets, brought into the library.
 *
 * Files uploaded before the library existed are real files doing real work —
 * they are on live product pages — and a library that could not see them would
 * be a second, emptier library rather than the store's files.
 *
 * Idempotent: recordMedia ignores a path it already holds, so running this
 * twice adds nothing the second time. That also makes it the repair for a
 * missed recording, which can happen because the row is written after the file
 * is stored and deliberately does not fail the upload if it cannot be.
 */

const BUCKETS = ["public-media", "paid-assets"] as const;

/** Guessed from the extension: storage keeps the mime type, listing does not return it. */
function mimeFromPath(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  const known: Record<string, string> = {
    webp: "image/webp",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    avif: "image/avif",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    pdf: "application/pdf",
    txt: "text/plain",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return known[ext] ?? "application/octet-stream";
}

/** The name as a person would recognise it: the filename, not the whole path. */
const leaf = (path: string) => path.split("/").pop() ?? path;

// Uploads are filed under owner folders — items/<id>/, courses/<id>/,
// products/<id>/, pages/<owner>/<id>/ — so listing has to walk down rather
// than read one flat directory.
async function walk(bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 4) return []; // nothing is nested deeper; a cycle cannot happen but a bug could
  const db = createServiceClient();
  const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return [];
  const out: string[] = [];
  for (const entry of data) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Storage marks a folder by having no file metadata, not by a flag.
    if (entry.id === null || entry.metadata === null) {
      out.push(...(await walk(bucket, path, depth + 1)));
    } else {
      out.push(path);
    }
  }
  return out;
}

export async function adoptStoredFiles(): Promise<number> {
  const db = createServiceClient();
  let added = 0;
  for (const bucket of BUCKETS) {
    const paths = await walk(bucket, "");
    if (paths.length === 0) continue;
    // Ask once which of these are already known, rather than once per file.
    const { data: known } = await db.from("media").select("path").eq("bucket", bucket).in("path", paths);
    const seen = new Set((known ?? []).map((r) => r.path as string));
    for (const path of paths) {
      if (seen.has(path)) continue;
      await recordMedia({
        bucket,
        path,
        filename: leaf(path),
        mime: mimeFromPath(path),
        // Unknown without downloading the file. Zero rather than a guess: the
        // library shows a size only when it has one.
        size: 0,
      });
      added++;
    }
  }
  return added;
}

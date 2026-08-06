import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { camelize } from "@/lib/case";

/**
 * The store's files, findable again.
 *
 * A file used to be a property of whatever it was uploaded to, so the same
 * photo on a product, its sales page and its course was three uploads with
 * three names and no way to get from one to the others. A row here makes it a
 * thing in its own right that any of them can point at.
 */

export type MediaRow = {
  id: string;
  bucket: "public-media" | "paid-assets";
  path: string;
  name: string;
  alt: string | null;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string;
};

/**
 * What a picker is asking for.
 *
 * A picker offers one kind and one kind only: choosing a PDF where an image was
 * wanted renders a broken image on a live sales page, and nothing about the
 * choice would have looked wrong at the time.
 */
export const KINDS = {
  image: ["image/"],
  audio: ["audio/"],
  document: ["application/pdf", "text/plain", "application/vnd.openxml"],
} as const;

export type MediaKind = keyof typeof KINDS;

export function kindOf(mime: string): MediaKind | null {
  for (const [kind, prefixes] of Object.entries(KINDS)) {
    if (prefixes.some((p) => mime.startsWith(p))) return kind as MediaKind;
  }
  return null;
}

const COLUMNS = "id, bucket, path, name, alt, mime, size, width, height, created_at";

/** A sensible name from a filename: no extension, no underscores pretending to be spaces. */
export function nameFromFile(filename: string): string {
  const stem = filename.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  return stem.length > 0 ? stem.slice(0, 120) : filename.slice(0, 120);
}

/**
 * Record an upload.
 *
 * Best-effort on purpose. This runs after the file is already in the bucket and
 * the product is about to be saved; failing the upload because a bookkeeping
 * row would not write would lose the file the person actually cared about. The
 * cost of a miss is one file absent from the library, which the backfill picks
 * up.
 */
export async function recordMedia(row: {
  bucket: MediaRow["bucket"];
  path: string;
  filename: string;
  mime: string;
  size: number;
  width?: number | null;
  height?: number | null;
}): Promise<void> {
  try {
    const db = createServiceClient();
    await db.from("media").upsert(
      {
        store_id: await getStoreId(),
        bucket: row.bucket,
        path: row.path,
        name: nameFromFile(row.filename),
        mime: row.mime,
        size: row.size,
        width: row.width ?? null,
        height: row.height ?? null,
      },
      { onConflict: "store_id,bucket,path", ignoreDuplicates: true },
    );
  } catch (e) {
    console.error("[recordMedia] not recorded:", e);
  }
}

export async function listMedia(kind?: MediaKind, search?: string): Promise<MediaRow[]> {
  const db = createServiceClient();
  let q = db
    .from("media")
    .select(COLUMNS)
    .eq("store_id", await getStoreId())
    .order("created_at", { ascending: false })
    .limit(300);
  if (kind) {
    // or() rather than a prefix match per call: "image/" and "application/pdf"
    // are both prefixes, so one operator covers both shapes of rule.
    q = q.or(KINDS[kind].map((p) => `mime.like.${p}*`).join(","));
  }
  if (search?.trim()) q = q.ilike("name", `%${search.trim()}%`);
  const { data } = await q;
  return camelize<MediaRow[]>(data ?? []);
}

export async function getMedia(id: string): Promise<MediaRow | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("media")
    .select(COLUMNS)
    .eq("store_id", await getStoreId())
    .eq("id", id)
    .maybeSingle();
  return data ? camelize<MediaRow>(data) : null;
}

export async function describeMedia(
  id: string,
  fields: { name?: string; alt?: string },
): Promise<void> {
  const db = createServiceClient();
  const patch: Record<string, string | null> = {};
  if (fields.name !== undefined) patch.name = fields.name.trim().slice(0, 120) || "Untitled";
  // An empty alt is a real answer — it means decorative, and it is not the same
  // as never having been asked. Stored as an empty string, not as null.
  if (fields.alt !== undefined) patch.alt = fields.alt.trim().slice(0, 300);
  if (Object.keys(patch).length === 0) return;
  await db.from("media").update(patch).eq("store_id", await getStoreId()).eq("id", id);
}

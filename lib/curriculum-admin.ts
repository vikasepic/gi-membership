import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";
import { getStoreId } from "@/lib/store";
import { sanitizeBodyHtml } from "@/lib/sanitize-html";
import { ITEM_COLUMNS, type Attachment, type CourseItem, type ItemType } from "@/lib/curriculum";

export type ItemInput = {
  itemType: ItemType;
  title: string;
  subtitle: string | null;
  bodyHtml: string | null;
  videoEmbedUrl: string | null;
  audioUrls: string[];
  isPublished: boolean;
};

export function nextSortOrder(siblings: { sortOrder: number }[]): number {
  return siblings.length === 0 ? 0 : Math.max(...siblings.map((s) => s.sortOrder)) + 1;
}

// Returns only the rows that must be written. Empty at a boundary so callers
// can no-op without special-casing.
export function swapOrder<T extends { id: string; sortOrder: number }>(
  siblings: T[],
  id: string,
  dir: "up" | "down",
): { id: string; sortOrder: number }[] {
  const ordered = [...siblings].sort((a, b) => a.sortOrder - b.sortOrder);
  const i = ordered.findIndex((s) => s.id === id);
  if (i === -1) return [];
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ordered.length) return [];
  return [
    { id: ordered[i].id, sortOrder: ordered[j].sortOrder },
    { id: ordered[j].id, sortOrder: ordered[i].sortOrder },
  ];
}

async function siblingsOf(courseId: string, parentId: string | null): Promise<CourseItem[]> {
  const db = createServiceClient();
  let q = db.from("course_items").select(ITEM_COLUMNS).eq("course_id", courseId);
  q = parentId === null ? q.is("parent_id", null) : q.eq("parent_id", parentId);
  const { data } = await q;
  return camelize<CourseItem[]>(data ?? []);
}

export async function createItem(
  courseId: string,
  parentId: string | null,
  input: ItemInput,
): Promise<string> {
  const db = createServiceClient();
  const sort = nextSortOrder(await siblingsOf(courseId, parentId));
  const { data, error } = await db
    .from("course_items")
    .insert({
      store_id: await getStoreId(),
      course_id: courseId,
      parent_id: parentId,
      item_type: input.itemType,
      title: input.title,
      subtitle: input.subtitle,
      body_html: sanitizeBodyHtml(input.bodyHtml ?? ""),
      video_embed_url: input.videoEmbedUrl,
      audio_urls: input.audioUrls,
      is_published: input.isPublished,
      sort_order: sort,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createItem: ${error.message}`);
  return data.id as string;
}

export async function updateItem(itemId: string, input: ItemInput): Promise<void> {
  const db = createServiceClient();
  const { error } = await db
    .from("course_items")
    .update({
      item_type: input.itemType,
      title: input.title,
      subtitle: input.subtitle,
      body_html: sanitizeBodyHtml(input.bodyHtml ?? ""),
      video_embed_url: input.videoEmbedUrl,
      audio_urls: input.audioUrls,
      is_published: input.isPublished,
    })
    .eq("id", itemId);
  if (error) throw new Error(`updateItem: ${error.message}`);
}

export async function deleteItem(itemId: string): Promise<void> {
  const db = createServiceClient();
  // Children cascade via the FK; progress rows cascade via progress.lesson_id.
  const { error } = await db.from("course_items").delete().eq("id", itemId);
  if (error) throw new Error(`deleteItem: ${error.message}`);
}

export async function countChildren(itemId: string): Promise<number> {
  const db = createServiceClient();
  const { count } = await db
    .from("course_items")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", itemId);
  return count ?? 0;
}

export async function moveItem(itemId: string, dir: "up" | "down"): Promise<void> {
  const db = createServiceClient();
  const current = await db
    .from("course_items")
    .select("id, course_id, parent_id, sort_order")
    .eq("id", itemId)
    .single();
  if (current.error || !current.data) throw new Error("moveItem: item not found");
  const row = camelize<CourseItem>(current.data);
  const writes = swapOrder(await siblingsOf(row.courseId, row.parentId), itemId, dir);
  if (writes.length === 0) return;
  // The sibling unique index rejects a direct two-row swap, so the DB-side
  // function parks one row at a free position first. Doing that inside a
  // single Postgres function makes the whole swap one atomic transaction —
  // no risk of a crash between statements stranding a row at -1.
  const { error } = await db.rpc("swap_course_item_order", {
    a_id: writes[0].id,
    b_id: writes[1].id,
  });
  if (error) throw new Error(`moveItem: ${error.message}`);
}

export async function setCover(itemId: string, coverPath: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("course_items").update({ cover_path: coverPath }).eq("id", itemId);
  if (error) throw new Error(`setCover: ${error.message}`);
}

export async function addAttachment(itemId: string, a: Attachment): Promise<void> {
  const db = createServiceClient();
  const { data } = await db.from("course_items").select("attachments").eq("id", itemId).single();
  const list = ((data?.attachments as Attachment[]) ?? []).concat(a);
  const { error } = await db.from("course_items").update({ attachments: list }).eq("id", itemId);
  if (error) throw new Error(`addAttachment: ${error.message}`);
}

export async function removeAttachment(itemId: string, path: string): Promise<void> {
  const db = createServiceClient();
  const { data } = await db.from("course_items").select("attachments").eq("id", itemId).single();
  const list = ((data?.attachments as Attachment[]) ?? []).filter((a) => a.path !== path);
  const { error } = await db.from("course_items").update({ attachments: list }).eq("id", itemId);
  if (error) throw new Error(`removeAttachment: ${error.message}`);
  await db.storage.from("paid-assets").remove([path]);
}

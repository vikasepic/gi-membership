import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";

// Chapters and lessons are one self-referencing tree: parent_id null = chapter,
// set = lesson. A chapter with no children is itself a content node.

export type Attachment = { path: string; name: string; size: number; mime: string };

export type CourseItem = {
  id: string;
  productId: string;
  parentId: string | null;
  title: string;
  subtitle: string | null;
  bodyHtml: string | null;
  videoEmbedUrl: string | null;
  coverPath: string | null;
  attachments: Attachment[];
  isPublished: boolean;
  sortOrder: number;
};

export type CurriculumNode = CourseItem & { children: CourseItem[] };

export const ITEM_COLUMNS =
  "id, product_id, parent_id, title, subtitle, body_html, video_embed_url, cover_path, attachments, is_published, sort_order";

const bySort = (a: CourseItem, b: CourseItem) => a.sortOrder - b.sortOrder;

// Orphans — a parentId pointing at a missing chapter — are excluded by
// construction: they attach to no chapter, so they render nowhere.
export function buildTree(items: CourseItem[]): CurriculumNode[] {
  return items
    .filter((i) => i.parentId === null)
    .sort(bySort)
    .map((c) => ({
      ...c,
      children: items.filter((i) => i.parentId === c.id).sort(bySort),
    }));
}

// A chapter WITH children is a container, not a completable unit. Countable
// items are every lesson plus every childless chapter.
export function rollupProgress(
  items: CourseItem[],
  completedIds: Set<string>,
): { done: number; total: number } {
  const published = items.filter((i) => i.isPublished);
  const parentIds = new Set(published.map((i) => i.parentId).filter(Boolean) as string[]);
  const countable = published.filter((i) => i.parentId !== null || !parentIds.has(i.id));
  return {
    done: countable.filter((i) => completedIds.has(i.id)).length,
    total: countable.length,
  };
}

export async function listCurriculum(
  productId: string,
  opts: { publishedOnly?: boolean } = {},
): Promise<CurriculumNode[]> {
  const db = createServiceClient();
  let q = db.from("course_items").select(ITEM_COLUMNS).eq("product_id", productId);
  if (opts.publishedOnly) q = q.eq("is_published", true);
  const { data, error } = await q.order("sort_order", { ascending: true });
  if (error) throw new Error(`listCurriculum: ${error.message}`);
  return buildTree(camelize<CourseItem[]>(data ?? []));
}

export async function getCourseItem(itemId: string): Promise<CourseItem | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("course_items")
    .select(ITEM_COLUMNS)
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw new Error(`getCourseItem: ${error.message}`);
  return data ? camelize<CourseItem>(data) : null;
}

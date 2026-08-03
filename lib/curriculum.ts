import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";

// Pure and student-side, so it lives in curriculum-student.ts where a
// component can import it without pulling "server-only" in with it.
export { rollupProgress } from "@/lib/curriculum-student";

// Chapters and lessons are one self-referencing tree: parent_id null = chapter,
// set = lesson. A chapter with no children is itself a content node.

export type Attachment = { path: string; name: string; size: number; mime: string };

// Per-lesson media type. This drives which fields the editor shows and how the
// student page renders, so one course can mix video, audio, PDF and text.
export type ItemType = "video" | "audio" | "pdf" | "text";

export type CourseItem = {
  id: string;
  courseId: string;
  parentId: string | null;
  itemType: ItemType;
  title: string;
  subtitle: string | null;
  bodyHtml: string | null;
  videoEmbedUrl: string | null;
  /** Externally hosted audio. Public — an upload is the protected option. */
  audioUrl: string | null;
  coverPath: string | null;
  attachments: Attachment[];
  isPublished: boolean;
  sortOrder: number;
};

export type CurriculumNode = CourseItem & { children: CourseItem[] };

export const ITEM_COLUMNS =
  "id, course_id, parent_id, item_type, title, subtitle, body_html, video_embed_url, audio_url, cover_path, attachments, is_published, sort_order";

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


// Default: published items only (fail safe). Admin callers must opt in with
// includeDrafts: true to see unpublished items. This prevents draft lessons
// from accidentally leaking to paying students.
export async function listCurriculum(
  courseId: string,
  opts: { includeDrafts?: boolean } = {},
): Promise<CurriculumNode[]> {
  const db = createServiceClient();
  let q = db.from("course_items").select(ITEM_COLUMNS).eq("course_id", courseId);
  if (!opts.includeDrafts) q = q.eq("is_published", true);
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

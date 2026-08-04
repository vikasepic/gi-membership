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
  /** Externally hosted audio, in order. Public — an upload is the protected option. */
  audioUrls: string[];
  coverPath: string | null;
  attachments: Attachment[];
  isPublished: boolean;
  sortOrder: number;
};

export type CurriculumNode = CourseItem & { children: CourseItem[] };

export const ITEM_COLUMNS =
  "id, course_id, parent_id, item_type, title, subtitle, body_html, video_embed_url, audio_urls, cover_path, attachments, is_published, sort_order";

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

// ---------------------------------------------------------------------------
// What a lesson is actually worth opening
// ---------------------------------------------------------------------------

/**
 * True when a lesson has nothing in it.
 *
 * Teachable's row says what type a lesson is. That is not the useful question:
 * every one of the lessons in this store is a "video" lesson with no video in
 * it. A published lesson holding nothing is a dead end somebody paid for, so
 * this is the thing the curriculum screen has to be loud about — and the thing
 * a publish guard should refuse.
 */
export function lessonIsEmpty(item: CourseItem): boolean {
  if (item.videoEmbedUrl?.trim()) return false;
  if (item.audioUrls.some((u) => u.trim())) return false;
  if (item.attachments.length > 0) return false;
  if (item.bodyHtml?.replace(/<[^>]*>/g, "").trim()) return false;
  return true;
}

/** Titles the editor generated rather than anyone chose. */
export function isUntitled(title: string): boolean {
  return /^new (chapter|lesson|section|item)$/i.test(title.trim());
}

export type CourseHealth = {
  chapters: number;
  lessons: number;
  published: number;
  /** Lessons with no content at all. */
  empty: number;
  /** Chapters and lessons still carrying the title the editor generated. */
  untitled: number;
  /** Published chapters with nothing inside — a buyer opens them and finds nothing. */
  hollowChapters: number;
  /** Published lessons that are empty. The worst case: paid for, and blank. */
  publishedEmpty: number;
};

/**
 * What is wrong with this curriculum, counted.
 *
 * Derived rather than stored, so it cannot go stale, and pure so the same
 * numbers can be asserted in a test and shown on the screen.
 */
export function courseHealth(nodes: CurriculumNode[]): CourseHealth {
  const lessons = nodes.flatMap((n) => n.children);
  const empties = lessons.filter(lessonIsEmpty);
  return {
    chapters: nodes.length,
    lessons: lessons.length,
    published: lessons.filter((l) => l.isPublished).length,
    empty: empties.length,
    untitled: [...nodes, ...lessons].filter((i) => isUntitled(i.title)).length,
    hollowChapters: nodes.filter((n) => n.isPublished && n.children.length === 0).length,
    publishedEmpty: empties.filter((l) => l.isPublished).length,
  };
}

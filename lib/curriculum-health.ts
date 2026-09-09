import type { CourseItem, CurriculumNode } from "@/lib/curriculum";

// Reading a curriculum, without touching one.
//
// Split from lib/curriculum.ts because that module is `server-only` and these
// are the numbers the admin screen renders in the browser. Types are erased at
// build time, so importing them from the server module costs nothing.

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

/**
 * True when a published chapter is a dead end: no lessons under it, and
 * nothing on the chapter itself either.
 */
export function chapterIsHollow(node: CurriculumNode): boolean {
  return node.isPublished && node.children.length === 0 && lessonIsEmpty(node);
}

export type CourseHealth = {
  chapters: number;
  lessons: number;
  published: number;
  /** Lessons with no content at all. */
  empty: number;
  /** Chapters and lessons still carrying the title the editor generated. */
  untitled: number;
  /**
   * Published chapters that hold nothing at all.
   *
   * "No lessons" is not the same as "nothing in it". A chapter row is a
   * course_item like any other and can carry the whole deliverable itself —
   * the Book Launch System is one published chapter holding a 674 KB PDF and
   * its write-up, with no lessons under it by design. Counting children alone
   * called that empty and told the owner buyers were opening a dead end.
   */
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
    hollowChapters: nodes.filter(chapterIsHollow).length,
    publishedEmpty: empties.filter((l) => l.isPublished).length,
  };
}

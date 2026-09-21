import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { listCurriculum } from "@/lib/curriculum";
import { countableItems } from "@/lib/curriculum-student";
import { courseProgress, type WatchRow } from "@/lib/watch";

/**
 * What a member has watched, for the library and for admin.
 *
 * One query for every progress row a member owns, then the curriculum of the
 * courses being asked about. The alternative is a query per course, which is
 * a row of cards each doing its own round trip.
 */

export type CourseProgress = {
  courseId: string;
  done: number;
  total: number;
  fraction: number;
};

export type LastLesson = {
  courseId: string;
  itemId: string;
  title: string;
  courseTitle: string;
  courseSlug: string;
  at: string;
  /** Where they stopped inside it, if it is a video they part-watched. */
  positionSeconds: number | null;
  durationSeconds: number | null;
  completed: boolean;
};

type Row = {
  courseId: string;
  itemId: string;
  completed: boolean;
  positionSeconds: number | null;
  durationSeconds: number | null;
  lastViewedAt: string | null;
};

/**
 * Every progress row for one member.
 *
 * Member-scoped, so this cannot approach the thousand rows PostgREST
 * truncates at without someone owning a thousand lessons. The admin's
 * all-members query is the one that pages; see `lastViewedForUsers`.
 */
export async function progressRowsFor(userId: string): Promise<Row[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("progress")
    .select("course_id, lesson_id, completed, position_seconds, duration_seconds, last_viewed_at")
    .eq("user_id", userId)
    .not("lesson_id", "is", null);
  if (error) throw new Error(`progressRowsFor: ${error.message}`);
  return (data ?? []).map((r) => ({
    courseId: r.course_id as string,
    itemId: r.lesson_id as string,
    completed: r.completed as boolean,
    positionSeconds: (r.position_seconds as number | null) ?? null,
    durationSeconds: (r.duration_seconds as number | null) ?? null,
    lastViewedAt: (r.last_viewed_at as string | null) ?? null,
  }));
}

/** A bar for each of the courses given, in the same order. */
export async function progressForCourses(
  userId: string,
  courses: { id: string }[],
): Promise<Map<string, CourseProgress>> {
  if (courses.length === 0) return new Map();
  const rows = await progressRowsFor(userId);
  const byCourse = new Map<string, Map<string, WatchRow>>();
  for (const r of rows) {
    const m = byCourse.get(r.courseId) ?? new Map<string, WatchRow>();
    m.set(r.itemId, { completed: r.completed, positionSeconds: r.positionSeconds, durationSeconds: r.durationSeconds });
    byCourse.set(r.courseId, m);
  }
  const out = new Map<string, CourseProgress>();
  await Promise.all(
    courses.map(async (c) => {
      const nodes = await listCurriculum(c.id);
      const ids = countableItems(nodes.flatMap((n) => [n, ...n.children])).map((i) => i.id);
      out.set(c.id, { courseId: c.id, ...courseProgress(ids, byCourse.get(c.id) ?? new Map()) });
    }),
  );
  return out;
}

/**
 * The lesson this member opened most recently, across every course they own.
 *
 * Null when nothing has been opened, which is a new member rather than an
 * error: the continue box simply does not appear.
 */
export async function lastLessonFor(
  userId: string,
  courses: { id: string; title: string; slug: string }[],
): Promise<LastLesson | null> {
  if (courses.length === 0) return null;
  const owned = new Map(courses.map((c) => [c.id, c]));
  const rows = (await progressRowsFor(userId))
    .filter((r) => r.lastViewedAt && owned.has(r.courseId))
    .sort((a, b) => {
      const d = new Date(b.lastViewedAt as string).getTime() - new Date(a.lastViewedAt as string).getTime();
      // Two lessons opened in the same second would otherwise be ordered by
      // whatever the database happened to return, so the continue box would
      // change its mind between renders. Any stable tiebreak beats that.
      return d !== 0 ? d : a.itemId.localeCompare(b.itemId);
    });
  for (const r of rows) {
    const course = owned.get(r.courseId);
    if (!course) continue;
    const db = createServiceClient();
    const { data } = await db.from("course_items").select("title, is_published").eq("id", r.itemId).maybeSingle();
    // A lesson unpublished since it was watched is not somewhere to send
    // anyone back to; fall through to the one before it.
    if (!data || data.is_published === false) continue;
    return {
      courseId: r.courseId,
      itemId: r.itemId,
      title: data.title as string,
      courseTitle: course.title,
      courseSlug: course.slug,
      at: r.lastViewedAt as string,
      positionSeconds: r.positionSeconds,
      durationSeconds: r.durationSeconds,
      completed: r.completed,
    };
  }
  return null;
}

/**
 * When each of these members last opened a lesson.
 *
 * Chunked and paged, for two different limits that both fail quietly. The id
 * list goes into the query string, so asking about every member at once
 * returns "URI too long" rather than an answer; and PostgREST caps a select
 * at a thousand rows with no error, so an unpaged read of a table that grows
 * as members times lessons would silently stop reporting activity for
 * whoever sorted last.
 */
export async function lastViewedForUsers(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const db = createServiceClient();
  const out = new Map<string, string>();
  const CHUNK = 100;
  const PAGE = 1000;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const chunk = userIds.slice(i, i + CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from("progress")
        .select("user_id, last_viewed_at")
        .in("user_id", chunk)
        .not("last_viewed_at", "is", null)
        .order("last_viewed_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`lastViewedForUsers: ${error.message}`);
      for (const r of data ?? []) {
        // Newest first, so the first time a member appears is their latest.
        if (!out.has(r.user_id as string)) out.set(r.user_id as string, r.last_viewed_at as string);
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return out;
}

/**
 * When each member last signed in.
 *
 * From the auth service rather than a column of our own, because the member
 * id is the auth id and a column would be a second copy of a fact that is
 * already recorded. Paged for the same reason as above: the default page is
 * fifty, and a store with more members than that would silently report every
 * later one as never having signed in.
 */
export async function lastSignInForAll(): Promise<Map<string, string>> {
  const db = createServiceClient();
  const out = new Map<string, string>();
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`lastSignInForAll: ${error.message}`);
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.last_sign_in_at) out.set(u.id, u.last_sign_in_at);
    }
    if (users.length < perPage) break;
  }
  return out;
}

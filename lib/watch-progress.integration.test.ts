import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { setItemPosition, touchItemViewed, watchRowFor, watchRowsFor, setItemCompletion } from "@/lib/progress";
import { createCourse } from "@/lib/courses";
import { createItem, type ItemInput } from "@/lib/curriculum-admin";

/**
 * A watch position against the real database.
 *
 * The arithmetic is unit-tested in lib/watch.test.ts. This is the half that
 * cannot be: the two CHECK constraints 0087 adds are invisible to tsc, to
 * vitest and to `next build`, so a feature can be green everywhere and still
 * be unable to save. The only way to know is to write a row.
 */
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const stamp = Date.now();
let userId = "";
const createdCourseIds: string[] = [];
const createdItemIds: string[] = [];

let seq = 0;

/** One member for the file; a fresh course and lesson for each test. */
beforeAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  const email = `zz-watch-${stamp}@example.com`;
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  userId = created.data.user.id;
  await db.from("users").insert({ id: userId, store_id: await getStoreId(), email, username: `zzwatch${stamp}` });
});

async function fixtures() {
  const db = createServiceClient();
  const storeId = await getStoreId();
  // Every test gets its own course. Integration suites share one local store
  // and run in parallel, so a fixture reused across tests is a fixture
  // another test can be holding.
  const n = (seq += 1);
  const courseId = await createCourse({
    slug: `zz-watch-${stamp}-${n}`,
    title: "zz watch fixture",
    subtitle: null,
    description: null,
    chapterLabel: "Chapter",
    lessonLabel: "Lesson",
    type: "video",
    status: "published",
  });
  createdCourseIds.push(courseId);
  const blank: ItemInput = {
    itemType: "video",
    title: "zz watch lesson",
    subtitle: null,
    bodyHtml: null,
    videoEmbedUrl: "https://vimeo.com/123456789",
    audioUrls: [],
    isPublished: true,
  };
  const itemId = await createItem(courseId, null, blank);
  createdItemIds.push(itemId);
  return { db, storeId, courseId, itemId };
}

afterAll(async () => {
  if (!canRun || !userId) return;
  // FK order: progress hangs off the item, the item off the course, and the
  // user row off auth.
  const db = createServiceClient();
  await db.from("progress").delete().eq("user_id", userId);
  for (const id of createdItemIds) await db.from("course_items").delete().eq("id", id);
  for (const id of createdCourseIds) await db.from("courses").delete().eq("id", id);
  await db.from("users").delete().eq("id", userId);
  await db.auth.admin.deleteUser(userId);
});

describe.skipIf(!canRun)("watch progress (integration)", () => {
  it("saves a playhead and reads it back", async () => {
    const { courseId, itemId } = await fixtures();
    await setItemPosition(userId, courseId, itemId, { positionSeconds: 6130, durationSeconds: 10800 });
    expect(await watchRowFor(userId, itemId)).toEqual({
      completed: false,
      positionSeconds: 6130,
      durationSeconds: 10800,
    });
  });

  it("never stores a position past the end of the video", async () => {
    // The bridge has been seen to report a shade past the duration on the
    // final frame, which would otherwise render a bar over 100%.
    const { courseId, itemId } = await fixtures();
    await setItemPosition(userId, courseId, itemId, { positionSeconds: 10850, durationSeconds: 10800 });
    expect((await watchRowFor(userId, itemId))?.positionSeconds).toBe(10800);
  });

  it("refuses a negative position at the database, not just in the code", async () => {
    // progress_position_sane. Proving the constraint exists is the point:
    // every other layer of this feature would let it through.
    const { db, storeId, courseId, itemId } = await fixtures();
    const { error } = await db.from("progress").insert({
      store_id: storeId,
      user_id: userId,
      course_id: courseId,
      lesson_id: itemId,
      completed: false,
      position_seconds: -3,
    });
    expect(error?.message ?? "").toMatch(/progress_position_sane|violates check constraint/i);
  });

  it("refuses a zero-length video", async () => {
    // progress_duration_sane. A zero duration is a divide by zero on every
    // bar that reads this row.
    const { db, storeId, courseId, itemId } = await fixtures();
    const { error } = await db.from("progress").insert({
      store_id: storeId,
      user_id: userId,
      course_id: courseId,
      lesson_id: itemId,
      completed: false,
      duration_seconds: 0,
    });
    expect(error?.message ?? "").toMatch(/progress_duration_sane|violates check constraint/i);
  });

  it("a position save never argues with a completion", async () => {
    // Completion has its own rules, including the manual override. A save
    // arriving every twenty seconds must not be able to undo them.
    const { courseId, itemId } = await fixtures();
    await setItemCompletion(userId, courseId, itemId, true, "manual");
    await setItemPosition(userId, courseId, itemId, { positionSeconds: 12, durationSeconds: 10800 });
    const row = await watchRowFor(userId, itemId);
    expect(row?.completed).toBe(true);
    expect(row?.positionSeconds).toBe(12);
  });

  it("records opening a lesson separately from playing it", async () => {
    const { db, courseId, itemId } = await fixtures();
    await touchItemViewed(userId, courseId, itemId);
    const { data } = await db
      .from("progress")
      .select("last_viewed_at, position_seconds")
      .eq("user_id", userId)
      .eq("lesson_id", itemId)
      .maybeSingle();
    expect(data?.last_viewed_at).toBeTruthy();
    // Opening is not watching: no playhead was invented.
    expect(data?.position_seconds).toBeNull();
  });

  it("returns a course's rows keyed by lesson", async () => {
    const { courseId, itemId } = await fixtures();
    await setItemPosition(userId, courseId, itemId, { positionSeconds: 60, durationSeconds: 600 });
    const rows = await watchRowsFor(userId, courseId);
    expect(rows.get(itemId)).toMatchObject({ positionSeconds: 60, durationSeconds: 600 });
  });
});

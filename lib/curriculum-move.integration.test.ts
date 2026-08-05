import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import {
  createItem,
  moveItemTo,
  setChapterPublished,
  setItemPublished,
  type ItemInput,
} from "@/lib/curriculum-admin";
import { listCurriculum } from "@/lib/curriculum";

// Runs against the real database, because the claim under test is a database
// one: sibling order is uniquely indexed, so a renumber has to happen inside a
// single transaction or it collides with itself. That cannot be asserted from
// a unit test — it either works in Postgres or it does not.

// No database in CI, so the whole file stands down there — the sibling suites
// do the same. Without this the root beforeAll still runs and the file fails
// on a missing NEXT_PUBLIC_SUPABASE_URL rather than skipping.
const canRun = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

const db = () => createServiceClient();
let courseId = "";

const chapterTitles = async () =>
  (await listCurriculum(courseId, { includeDrafts: true })).map((c) => c.title);
const lessonTitles = async (chapterIndex: number) =>
  (await listCurriculum(courseId, { includeDrafts: true }))[chapterIndex].children.map((l) => l.title);

beforeAll(async () => {
  const { data, error } = await db()
    .from("courses")
    .insert({
      store_id: await getStoreId(),
      slug: `move-test-${crypto.randomUUID().slice(0, 8)}`,
      title: "Ordering fixture",
      chapter_label: "Chapter",
      lesson_label: "Lesson",
      type: "text",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  courseId = data.id as string;

  const blank = (title: string, itemType: ItemInput["itemType"]): ItemInput => ({
    itemType, title, subtitle: null, bodyHtml: null, videoEmbedUrl: null,
    audioUrls: [], isPublished: false,
  });
  for (const t of ["One", "Two", "Three"]) {
    const chapter = await createItem(courseId, null, blank(t, "text"));
    for (const l of ["a", "b", "c"]) {
      await createItem(courseId, chapter, blank(`${t}-${l}`, "video"));
    }
  }
}, 60_000);

afterAll(async () => {
  if (courseId) await db().from("courses").delete().eq("id", courseId);
});

describe.skipIf(!canRun)("moving a lesson", () => {
  it("starts in the order it was created", async () => {
    expect(await chapterTitles()).toEqual(["One", "Two", "Three"]);
    expect(await lessonTitles(0)).toEqual(["One-a", "One-b", "One-c"]);
  });

  it("moves down within its chapter and lands where it was dropped", async () => {
    const tree = await listCurriculum(courseId, { includeDrafts: true });
    await moveItemTo(tree[0].children[0].id, tree[0].id, 2);
    expect(await lessonTitles(0)).toEqual(["One-b", "One-c", "One-a"]);
  });

  it("moves back up", async () => {
    const tree = await listCurriculum(courseId, { includeDrafts: true });
    await moveItemTo(tree[0].children[2].id, tree[0].id, 0);
    expect(await lessonTitles(0)).toEqual(["One-a", "One-b", "One-c"]);
  });

  it("moves into another chapter, and closes the gap behind it", async () => {
    const tree = await listCurriculum(courseId, { includeDrafts: true });
    await moveItemTo(tree[0].children[1].id, tree[1].id, 0);
    expect(await lessonTitles(0)).toEqual(["One-a", "One-c"]);
    expect(await lessonTitles(1)).toEqual(["One-b", "Two-a", "Two-b", "Two-c"]);
  });

  it("leaves no gaps or duplicates in either list", async () => {
    const tree = await listCurriculum(courseId, { includeDrafts: true });
    for (const ch of tree) {
      const orders = ch.children.map((l) => l.sortOrder);
      expect(orders, ch.title).toEqual(orders.map((_, i) => i));
    }
    const chapterOrders = tree.map((c) => c.sortOrder);
    expect(chapterOrders).toEqual(chapterOrders.map((_, i) => i));
  });

  it("clamps an index past the end rather than leaving a hole", async () => {
    const tree = await listCurriculum(courseId, { includeDrafts: true });
    const last = tree[1].children.length - 1;
    await moveItemTo(tree[1].children[0].id, tree[1].id, 99);
    const after = await lessonTitles(1);
    expect(after).toHaveLength(last + 1);
    expect(after[last]).toBe("One-b");
  });
});

describe.skipIf(!canRun)("moving a chapter", () => {
  it("reorders among chapters", async () => {
    const tree = await listCurriculum(courseId, { includeDrafts: true });
    await moveItemTo(tree[2].id, null, 0);
    expect(await chapterTitles()).toEqual(["Three", "One", "Two"]);
  });

  it("brings its lessons with it", async () => {
    expect(await lessonTitles(0)).toEqual(["Three-a", "Three-b", "Three-c"]);
  });
});

describe.skipIf(!canRun)("what it refuses", () => {
  it("will not nest a chapter inside another", async () => {
    const tree = await listCurriculum(courseId, { includeDrafts: true });
    await expect(moveItemTo(tree[0].id, tree[1].id, 0)).rejects.toThrow(/chapter cannot be nested/i);
  });

  it("will not turn a lesson into a chapter", async () => {
    const tree = await listCurriculum(courseId, { includeDrafts: true });
    await expect(moveItemTo(tree[0].children[0].id, null, 0)).rejects.toThrow(/has to live in a chapter/i);
  });

  it("will not move a lesson into another course's chapter", async () => {
    const tree = await listCurriculum(courseId, { includeDrafts: true });
    await expect(
      moveItemTo(tree[0].children[0].id, crypto.randomUUID(), 0),
    ).rejects.toThrow(/not a chapter of this course/i);
  });

  it("refuses a negative index before it reaches the database", async () => {
    const tree = await listCurriculum(courseId, { includeDrafts: true });
    await expect(moveItemTo(tree[0].children[0].id, tree[0].id, -1)).rejects.toThrow(/bad index/i);
  });
});

describe.skipIf(!canRun)("publishing from the curriculum row", () => {
  it("toggles one lesson without touching its other fields", async () => {
    const tree = await listCurriculum(courseId, { includeDrafts: true });
    const lesson = tree[0].children[0];
    await setItemPublished(lesson.id, true);
    const after = (await listCurriculum(courseId, { includeDrafts: true }))[0].children[0];
    expect(after.isPublished).toBe(true);
    expect(after.title).toBe(lesson.title);
    expect(after.itemType).toBe(lesson.itemType);
  });

  it("publishes a chapter and everything in it", async () => {
    const tree = await listCurriculum(courseId, { includeDrafts: true });
    await setChapterPublished(tree[1].id, true);
    const after = (await listCurriculum(courseId, { includeDrafts: true }))[1];
    expect(after.isPublished).toBe(true);
    expect(after.children.every((l) => l.isPublished)).toBe(true);
  });

  it("unpublishes a chapter and everything in it", async () => {
    const tree = await listCurriculum(courseId, { includeDrafts: true });
    await setChapterPublished(tree[1].id, false);
    const after = (await listCurriculum(courseId, { includeDrafts: true }))[1];
    expect(after.isPublished).toBe(false);
    expect(after.children.some((l) => l.isPublished)).toBe(false);
  });

  it("leaves other chapters alone", async () => {
    const tree = await listCurriculum(courseId, { includeDrafts: true });
    expect(tree[0].children[0].isPublished).toBe(true);
  });
});

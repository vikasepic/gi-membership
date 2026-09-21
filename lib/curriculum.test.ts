import { describe, it, expect } from "vitest";
import { buildTree, rollupProgress, type CourseItem } from "@/lib/curriculum";

const item = (over: Partial<CourseItem> & { id: string }): CourseItem => ({
  courseId: "c1",
  itemType: "text" as const,
  parentId: null,
  title: "t",
  subtitle: null,
  bodyHtml: null,
  videoEmbedUrl: null,
  audioUrls: [],
  coverPath: null,
  attachments: [],
  isPublished: true,
  sortOrder: 0,
  ...over,
});

describe("buildTree", () => {
  it("nests lessons under their chapter in sort order", () => {
    const tree = buildTree([
      item({ id: "l2", parentId: "c1", sortOrder: 1 }),
      item({ id: "c1", sortOrder: 0 }),
      item({ id: "l1", parentId: "c1", sortOrder: 0 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe("c1");
    expect(tree[0].children.map((c) => c.id)).toEqual(["l1", "l2"]);
  });

  it("orders chapters by sortOrder", () => {
    const tree = buildTree([item({ id: "b", sortOrder: 1 }), item({ id: "a", sortOrder: 0 })]);
    expect(tree.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("keeps a childless chapter as a content node with no children", () => {
    const tree = buildTree([item({ id: "c1" })]);
    expect(tree[0].children).toEqual([]);
  });

  it("drops an orphan whose parent is absent", () => {
    const tree = buildTree([item({ id: "l1", parentId: "missing" })]);
    expect(tree).toEqual([]);
  });
});

describe("rollupProgress", () => {
  it("counts a childless chapter and every lesson, but not a chapter with children", () => {
    const items = [
      item({ id: "c1" }),
      item({ id: "l1", parentId: "c1" }),
      item({ id: "l2", parentId: "c1" }),
      item({ id: "c2" }),
    ];
    expect(rollupProgress(items, new Set(["l1"]))).toMatchObject({ done: 1, total: 3 });
  });

  it("ignores unpublished items", () => {
    const items = [item({ id: "c1" }), item({ id: "l1", parentId: "c1", isPublished: false })];
    expect(rollupProgress(items, new Set())).toMatchObject({ done: 0, total: 1 });
  });

  it("reports zero of zero for an empty course", () => {
    expect(rollupProgress([], new Set())).toMatchObject({ done: 0, total: 0, fraction: 0 });
  });
});

describe("rollupProgress with watched time", () => {
  const items = [
    { id: "l1", parentId: null, isPublished: true },
    { id: "l2", parentId: null, isPublished: true },
  ] as Parameters<typeof rollupProgress>[0];

  it("moves the bar for a part-watched lesson while the count stays put", () => {
    // The whole reason this exists: an hour into a three-hour lesson is not
    // zero progress, but it is not a completed lesson either.
    const watch = new Map([["l1", { completed: false, positionSeconds: 3600, durationSeconds: 10800 }]]);
    const r = rollupProgress(items, new Set(), watch);
    expect(r.done).toBe(0);
    expect(r.total).toBe(2);
    expect(r.fraction).toBeCloseTo(1 / 6);
  });

  it("counts a completed lesson as whole even when its playhead says otherwise", () => {
    // Completion can arrive from the button or a download, neither of which
    // moves a playhead. The completed set is the authority.
    const watch = new Map([["l1", { completed: false, positionSeconds: 5, durationSeconds: 10800 }]]);
    expect(rollupProgress(items, new Set(["l1"]), watch).fraction).toBeCloseTo(0.5);
  });

  it("falls back to whole lessons when no watch rows are given", () => {
    expect(rollupProgress(items, new Set(["l1"])).fraction).toBeCloseTo(0.5);
  });
});

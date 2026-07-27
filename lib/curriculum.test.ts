import { describe, it, expect } from "vitest";
import { buildTree, rollupProgress, type CourseItem } from "@/lib/curriculum";

const item = (over: Partial<CourseItem> & { id: string }): CourseItem => ({
  productId: "p1",
  parentId: null,
  title: "t",
  subtitle: null,
  bodyHtml: null,
  videoEmbedUrl: null,
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
    expect(rollupProgress(items, new Set(["l1"]))).toEqual({ done: 1, total: 3 });
  });

  it("ignores unpublished items", () => {
    const items = [item({ id: "c1" }), item({ id: "l1", parentId: "c1", isPublished: false })];
    expect(rollupProgress(items, new Set())).toEqual({ done: 0, total: 1 });
  });

  it("reports zero of zero for an empty course", () => {
    expect(rollupProgress([], new Set())).toEqual({ done: 0, total: 0 });
  });
});

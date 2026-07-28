import { describe, it, expect } from "vitest";
import { flattenPlayable, neighbours, firstIncomplete } from "@/lib/curriculum-student";
import type { CurriculumNode, CourseItem } from "@/lib/curriculum";

const base = (id: string, parentId: string | null = null): CourseItem => ({
  id, courseId: "c", parentId, itemType: "text" as const, title: id, subtitle: null, bodyHtml: null,
  videoEmbedUrl: null, coverPath: null, attachments: [], isPublished: true, sortOrder: 0,
});
const node = (id: string, children: CourseItem[] = []): CurriculumNode => ({ ...base(id), children });

describe("flattenPlayable", () => {
  it("returns lessons in reading order and skips chapters that have children", () => {
    const tree = [node("c1", [base("l1", "c1"), base("l2", "c1")]), node("c2", [base("l3", "c2")])];
    expect(flattenPlayable(tree).map((i) => i.id)).toEqual(["l1", "l2", "l3"]);
  });

  it("includes a childless chapter as its own playable item", () => {
    const tree = [node("c1", [base("l1", "c1")]), node("c2")];
    expect(flattenPlayable(tree).map((i) => i.id)).toEqual(["l1", "c2"]);
  });
});

describe("neighbours", () => {
  const flat = [base("a"), base("b"), base("c")];
  it("returns previous and next across the whole course", () => {
    expect(neighbours(flat, "b")).toEqual({ prev: flat[0], next: flat[2] });
  });
  it("returns null at the boundaries", () => {
    expect(neighbours(flat, "a").prev).toBeNull();
    expect(neighbours(flat, "c").next).toBeNull();
  });
});

describe("firstIncomplete", () => {
  it("returns the first item not yet completed", () => {
    const flat = [base("a"), base("b"), base("c")];
    expect(firstIncomplete(flat, new Set(["a"]))?.id).toBe("b");
  });
  it("returns null when everything is complete", () => {
    const flat = [base("a")];
    expect(firstIncomplete(flat, new Set(["a"]))).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { courseHealth, isUntitled, lessonIsEmpty } from "@/lib/curriculum-health";
import type { CourseItem, CurriculumNode } from "@/lib/curriculum";

const item = (over: Partial<CourseItem> = {}): CourseItem => ({
  id: "i", courseId: "c", parentId: "p", itemType: "video", title: "A lesson",
  subtitle: null, bodyHtml: null, videoEmbedUrl: null, audioUrls: [], coverPath: null,
  attachments: [], isPublished: false, sortOrder: 0, ...over,
});
const chapter = (over: Partial<CurriculumNode> = {}): CurriculumNode =>
  ({ ...item({ parentId: null, itemType: "text", title: "A chapter" }), children: [], ...over });

describe("lessonIsEmpty", () => {
  it("a lesson with nothing in it is empty, whatever type it claims", () => {
    // Every lesson in this store is a "video" lesson with no video in it.
    expect(lessonIsEmpty(item())).toBe(true);
    expect(lessonIsEmpty(item({ itemType: "pdf" }))).toBe(true);
  });

  const filled: [string, Partial<CourseItem>][] = [
    ["a video", { videoEmbedUrl: "https://youtu.be/aqz-KE-bpKQ" }],
    ["an audio link", { audioUrls: ["https://x.test/a.mp3"] }],
    ["a file", { attachments: [{ path: "p", name: "n", size: 1, mime: "application/pdf" }] }],
    ["written body", { bodyHtml: "<p>Real words</p>" }],
  ];
  it.each(filled)("is not empty with %s", (_n, over) => {
    expect(lessonIsEmpty(item(over))).toBe(false);
  });

  it("sees through markup that holds no words", () => {
    expect(lessonIsEmpty(item({ bodyHtml: "<p></p><br>" }))).toBe(true);
  });

  it("sees through a whitespace-only URL", () => {
    expect(lessonIsEmpty(item({ videoEmbedUrl: "   ", audioUrls: ["  "] }))).toBe(true);
  });
});

describe("isUntitled", () => {
  it("catches what the editor generated", () => {
    for (const t of ["New Lesson", "new chapter", "  New Lesson  ", "New Section"]) {
      expect(isUntitled(t), t).toBe(true);
    }
  });

  it("leaves a real title alone", () => {
    for (const t of ["New rules for carousels", "Lesson one", "Chapter and verse"]) {
      expect(isUntitled(t), t).toBe(false);
    }
  });
});

describe("courseHealth", () => {
  it("counts the store's Product Validator course as it actually stands", () => {
    // Read from production: three chapters, three lessons, none published,
    // all empty, every title still the generated one.
    const nodes = [
      chapter({ title: "Product Validator", isPublished: true, children: [
        item({ id: "a", title: "New Lesson" }), item({ id: "b", title: "New Lesson", itemType: "audio" }),
      ]}),
      chapter({ title: "New Chapter", isPublished: true, children: [item({ id: "c", title: "New Lesson" })] }),
      chapter({ title: "New Chapter", isPublished: false, children: [] }),
    ];
    expect(courseHealth(nodes)).toEqual({
      chapters: 3, lessons: 3, published: 0, empty: 3, untitled: 5,
      hollowChapters: 0, publishedEmpty: 0,
    });
  });

  it("counts a published chapter with nothing in it", () => {
    const nodes = [chapter({ title: "Bonuses", isPublished: true, children: [] })];
    expect(courseHealth(nodes).hollowChapters).toBe(1);
  });

  it("counts a published lesson that is empty — the worst case", () => {
    const nodes = [chapter({ title: "Start", isPublished: true, children: [
      item({ id: "a", title: "Watch this", isPublished: true }),
    ]})];
    const h = courseHealth(nodes);
    expect(h.publishedEmpty).toBe(1);
    expect(h.published).toBe(1);
  });

  it("says nothing is wrong with a finished course", () => {
    const nodes = [chapter({ title: "Start here", isPublished: true, children: [
      item({ id: "a", title: "The first idea", isPublished: true, videoEmbedUrl: "https://youtu.be/aqz-KE-bpKQ" }),
    ]})];
    expect(courseHealth(nodes)).toMatchObject({ empty: 0, untitled: 0, hollowChapters: 0, publishedEmpty: 0 });
  });

  it("is empty-safe", () => {
    expect(courseHealth([])).toMatchObject({ chapters: 0, lessons: 0, published: 0, empty: 0 });
  });
});

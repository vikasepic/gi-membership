// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { CourseItem, CurriculumNode } from "@/lib/curriculum";

// Every server action is stubbed: the claim under test is what the screen
// SENDS, not what the database does with it — that is covered against real
// Postgres in curriculum-move.integration.test.ts.
const calls: { action: string; fields: Record<string, string> }[] = [];
const record = (action: string) => (fd: FormData) => {
  calls.push({ action, fields: Object.fromEntries(fd.entries()) as Record<string, string> });
  return Promise.resolve();
};
vi.mock("@/app/admin/courses/[id]/items/actions", () => ({
  addChapterAction: record("addChapter"),
  addLessonAction: record("addLesson"),
  deleteItemAction: record("deleteItem"),
  moveItemToAction: record("moveItemTo"),
  renameItemAction: record("renameItem"),
  setPublishedAction: record("setPublished"),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const { Curriculum } = await import("@/components/admin/curriculum");

const item = (over: Partial<CourseItem> = {}): CourseItem => ({
  id: "i", courseId: "c", parentId: "p", itemType: "video", title: "A lesson",
  subtitle: null, bodyHtml: null, videoEmbedUrl: null, audioUrls: [], coverPath: null,
  attachments: [], isPublished: false, sortOrder: 0, ...over,
});
const chapter = (over: Partial<CurriculumNode> = {}): CurriculumNode =>
  ({ ...item({ parentId: null, itemType: "text" }), children: [], ...over });

/** The store's Product Validator course, as it actually stands. */
const REAL: CurriculumNode[] = [
  chapter({ id: "c1", title: "Product Validator", isPublished: true, children: [
    item({ id: "l1", title: "New Lesson" }),
    item({ id: "l2", title: "New Lesson", itemType: "audio" }),
  ]}),
  chapter({ id: "c2", title: "New Chapter", isPublished: true, children: [item({ id: "l3", title: "New Lesson" })] }),
  chapter({ id: "c3", title: "New Chapter", isPublished: false, children: [] }),
];

// Torn down after every test. A root left mounted keeps React scheduling, and
// work that lands after the environment is gone throws on `window`.
let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const root = mounted;
  mounted = null;
  if (root) act(() => root.unmount());
});

function mount(nodes: CurriculumNode[]) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  act(() => {
    root.render(
      <Curriculum courseId="course-1" nodes={nodes} chapterLabel="Chapter" lessonLabel="Lesson" />,
    );
  });
}
const click = (el: Element | null | undefined) => {
  if (!el) throw new Error("nothing to click");
  act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
const byText = (sel: string, text: string) =>
  [...document.querySelectorAll(sel)].find((e) => e.textContent?.trim() === text);
const text = () => document.body.textContent ?? "";

beforeEach(() => { calls.length = 0; });

describe("what it says about the real course", () => {
  it("counts what is there", () => {
    mount(REAL);
    expect(text()).toContain("3");
    expect(text()).toContain("chapters");
    expect(text()).toContain("lessons");
  });

  it("names every lesson as empty, because every one is", () => {
    mount(REAL);
    expect(document.body.textContent!.match(/Empty/g)).toHaveLength(3);
  });

  it("marks the untitled work", () => {
    mount(REAL);
    expect(text()).toContain("Untitled");
    expect(text()).toContain("still untitled");
  });

  it("warns that nothing is published", () => {
    mount(REAL);
    expect(text()).toContain("nothing is published");
  });

  it("says what a live empty chapter costs, in the chapter itself", () => {
    mount([chapter({ id: "x", title: "Bonuses", isPublished: true, children: [] })]);
    expect(text()).toContain("a buyer opens it and finds nothing");
  });

  it("says nothing is wrong with a finished course", () => {
    mount([chapter({ id: "x", title: "Start here", isPublished: true, children: [
      item({ id: "a", title: "The first idea", isPublished: true, videoEmbedUrl: "https://youtu.be/x" }),
    ]})]);
    expect(text()).not.toContain("Needs attention");
    expect(text()).not.toContain("Empty");
  });

  it("lists what a filled lesson holds", () => {
    mount([chapter({ id: "x", title: "Start", children: [
      item({ id: "a", title: "Watch", videoEmbedUrl: "https://youtu.be/x",
        attachments: [{ path: "p", name: "n", size: 1, mime: "application/pdf" }] }),
    ]})]);
    expect(text()).toContain("video · 1 file");
  });
});

describe("what it sends", () => {
  it("publishes one lesson without touching anything else", () => {
    mount(REAL);
    click(byText("button", "Publish"));
    expect(calls).toEqual([{ action: "setPublished",
      fields: { courseId: "course-1", itemId: "l1", published: "true" } }]);
  });

  it("unpublishes a chapter and everything in it", () => {
    mount(REAL);
    click(byText("button", "Unpublish all"));
    expect(calls[0]).toEqual({ action: "setPublished",
      fields: { courseId: "course-1", itemId: "c1", scope: "chapter", published: "false" } });
  });

  it("adds a chapter and a lesson", () => {
    mount(REAL);
    click(byText("button", "Add chapter"));
    expect(calls[0]).toMatchObject({ action: "addChapter", fields: { title: "New Chapter" } });
    calls.length = 0;
    click(byText("button", "Add lesson"));
    expect(calls[0]).toMatchObject({ action: "addLesson", fields: { parentId: "c1", title: "New Lesson" } });
  });

  it("renames in place", () => {
    mount(REAL);
    click(byText("button", "Rename"));
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Why validation matters");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(calls[0]).toEqual({ action: "renameItem",
      fields: { courseId: "course-1", itemId: "l1", title: "Why validation matters" } });
  });

  it("sends nothing when a rename changes nothing", () => {
    mount(REAL);
    click(byText("button", "Rename"));
    const input = document.querySelector('input[aria-label="Title"]') as HTMLInputElement;
    act(() => { input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(calls).toHaveLength(0);
  });

  it("takes two clicks to delete, and says what goes", () => {
    mount(REAL);
    click(document.querySelector('[aria-label="Delete chapter"]'));
    expect(calls).toHaveLength(0);
    expect(text()).toContain("and its 2 lessons");
    click(byText("button", "Delete"));
    expect(calls[0]).toEqual({ action: "deleteItem", fields: { courseId: "course-1", itemId: "c1" } });
  });

  it("lets a delete be called off", () => {
    mount(REAL);
    click(document.querySelector('[aria-label="Delete chapter"]'));
    click(byText("button", "Keep"));
    expect(calls).toHaveLength(0);
    expect(text()).not.toContain("cannot be undone");
  });

  it("folds a chapter away and back", () => {
    mount(REAL);
    const fold = document.querySelector('[aria-label^="Collapse"]')!;
    expect(text()).toContain("A lesson".slice(0, 0) + "New Lesson");
    click(fold);
    expect(document.querySelectorAll("li li").length).toBeLessThan(3);
    click(document.querySelector('[aria-label^="Expand"]')!);
    expect(document.querySelector('[aria-label^="Collapse"]')).toBeTruthy();
  });
});

describe("dragging sends a finished position", () => {
  const drag = (fromSel: string, toSel: string) => {
    const from = document.querySelectorAll(fromSel);
    const to = document.querySelectorAll(toSel);
    act(() => {
      const dt = { effectAllowed: "", setData() {}, getData() { return ""; } };
      from[0].dispatchEvent(Object.assign(new Event("dragstart", { bubbles: true }), { dataTransfer: dt }));
      to[0].dispatchEvent(Object.assign(new Event("dragover", { bubbles: true, cancelable: true }), { dataTransfer: dt }));
      to[0].dispatchEvent(Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer: dt }));
    });
  };

  it("sends the destination chapter and index for a lesson", () => {
    mount(REAL);
    const lessons = [...document.querySelectorAll("ul > li")];
    act(() => {
      const dt = { effectAllowed: "", setData() {}, getData() { return ""; } };
      lessons[0].dispatchEvent(Object.assign(new Event("dragstart", { bubbles: true }), { dataTransfer: dt }));
      lessons[1].dispatchEvent(Object.assign(new Event("dragover", { bubbles: true, cancelable: true }), { dataTransfer: dt }));
      lessons[1].dispatchEvent(Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer: dt }));
    });
    expect(calls[0]).toEqual({ action: "moveItemTo",
      fields: { courseId: "course-1", itemId: "l1", parentId: "c1", index: "1" } });
  });

  it("sends an empty parent for a chapter, which the action reads as top level", () => {
    mount(REAL);
    const chapters = [...document.querySelectorAll("ol > li")];
    act(() => {
      const dt = { effectAllowed: "", setData() {}, getData() { return ""; } };
      chapters[2].dispatchEvent(Object.assign(new Event("dragstart", { bubbles: true }), { dataTransfer: dt }));
      chapters[0].dispatchEvent(Object.assign(new Event("dragover", { bubbles: true, cancelable: true }), { dataTransfer: dt }));
      chapters[0].dispatchEvent(Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer: dt }));
    });
    expect(calls[0]).toEqual({ action: "moveItemTo",
      fields: { courseId: "course-1", itemId: "c3", parentId: "", index: "0" } });
  });
});

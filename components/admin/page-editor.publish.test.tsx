// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { defaultRows, SECTIONS } from "@/lib/page-sections";

const publish = vi.fn(async (_fd: FormData) => ({ published: 2, updatedAt: { hero: "2026-09-14T10:00:00Z" } }));
const saveSection = vi.fn(async (_fd: FormData) => ({ savedKey: "hero", updatedAt: "2026-09-14T09:00:00Z" }));
vi.mock("@/app/admin/pages/actions", () => ({
  saveSectionAction: (_p: unknown, fd: FormData) => saveSection(fd),
  publishPageAction: (_p: unknown, fd: FormData) => publish(fd),
  discardDraftAction: vi.fn(async () => ({ row: defaultRows(SECTIONS)[0] })),
  copyPageAction: vi.fn(async () => ({})),
}));
vi.mock("@/app/admin/templates/actions", () => ({ saveGlobalBlocksAction: vi.fn(), saveTemplateAction: vi.fn() }));
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

const { PageEditor } = await import("@/components/admin/page-editor");

let host: HTMLDivElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
  publish.mockClear();
  saveSection.mockClear();
});

function mount(rows = defaultRows(SECTIONS)) {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() =>
    createRoot(host!).render(
      <PageEditor
        ownerType="product"
        ownerId="11111111-1111-1111-1111-111111111111"
        initial={rows}
        money={{ priceLabel: "$9", termsLabel: null }}
        previewHref="/p/x?preview=1"
      />,
    ),
  );
  return host;
}

const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

describe("save then publish from one render", () => {
  it("does not save a second time against the stale baseline", async () => {
    // Seen 15 Sep 2026: the builder's Publish runs save() then onPublish()
    // in one click. onPublish is the closure from before the save, so it
    // saved again with the old updated_at and reported "changed by someone
    // else" with nobody else there. Both clicks here fire from the same
    // render, which is the same situation.
    const el = mount();
    const toggle = el.querySelector<HTMLButtonElement>('button[role="switch"]')!;
    await act(async () => toggle.click());
    const save = [...el.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Save draft")!;
    const pub = button(el, "Publish page");
    await act(async () => {
      save.click();
      pub.click();
    });
    expect(saveSection).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(el.textContent).not.toContain("changed by someone else");
  });
});

describe("publishing from the page bar", () => {
  it("is disabled with nothing to publish, and a saved draft enables it", () => {
    const rows = defaultRows(SECTIONS);
    expect(button(mount(rows), "Publish page").disabled).toBe(true);
    host!.remove();
    expect(button(mount([{ ...rows[0], hasDraft: true }, ...rows.slice(1)]), "Publish page").disabled).toBe(false);
  });

  it("publishes the whole page and marks every draft as live", async () => {
    const rows = defaultRows(SECTIONS);
    const el = mount([{ ...rows[0], hasDraft: true }, ...rows.slice(1)]);
    expect(el.textContent).toContain("Draft");
    await act(async () => button(el, "Publish page").click());
    expect(publish).toHaveBeenCalledTimes(1);
    const fd = publish.mock.calls[0][0];
    expect(fd.get("sectionKey")).toBe("");
    expect(el.textContent).toContain("Published.");
    expect(button(el, "Publish page").disabled).toBe(true);
  });
});

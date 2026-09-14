// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { defaultRows, SECTIONS } from "@/lib/page-sections";

const publish = vi.fn(async (_fd: FormData) => ({ published: 2, updatedAt: { hero: "2026-09-14T10:00:00Z" } }));
vi.mock("@/app/admin/pages/actions", () => ({
  saveSectionAction: vi.fn(async () => ({ savedKey: "hero", updatedAt: "2026-09-14T09:00:00Z" })),
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

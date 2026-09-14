// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("@/app/admin/pages/actions", () => ({
  savePageSettingsAction: vi.fn(async () => ({ saved: true })),
}));
const { PageSeo } = await import("@/components/admin/page-seo");
const { PageSettings } = await import("@/components/admin/page-settings");

let host: HTMLDivElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

function mount(node: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => createRoot(host!).render(node));
  return host;
}

describe("the SEO and custom code panels", () => {
  it("say a save is a draft", async () => {
    const el = mount(
      <PageSeo
        ownerType="product"
        ownerId="p"
        metaTitle=""
        metaDescription=""
        shareImagePath=""
        fallbackTitle="T"
        fallbackDescription=""
        fallbackImageUrl={null}
      />,
    );
    await act(async () => el.querySelector("form")!.requestSubmit());
    expect(el.textContent).toContain("Saved as a draft. Publish the page to make it live.");
  });

  it("the custom code panel says the same", async () => {
    const el = mount(<PageSettings ownerType="product" ownerId="p" customCss="" customJs="" snippets={[]} />);
    // Collapsed until opened; the form is behind the toggle.
    await act(async () => (el.querySelector("button") as HTMLButtonElement).click());
    await act(async () => el.querySelector("form")!.requestSubmit());
    expect(el.textContent).toContain("Saved as a draft. Publish the page to make it live.");
  });
});

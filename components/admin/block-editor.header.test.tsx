// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { bandTheme } from "@/lib/page-sections";

vi.mock("@/app/admin/templates/actions", () => ({ saveTemplateAction: vi.fn(), saveGlobalBlocksAction: vi.fn() }));
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

const { BlockEditor } = await import("@/components/admin/block-editor");

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  // Unmounted, not only removed: the builder portals onto the body, and a
  // root left mounted leaves the previous test's buttons for the next to find.
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  host = null;
});

function mount(over: Partial<React.ComponentProps<typeof BlockEditor>> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <BlockEditor
        blocks={[]}
        theme={bandTheme("paper")}
        title="Hero"
        onChange={() => {}}
        onClose={() => {}}
        {...over}
      />,
    ),
  );
  return host;
}
// The builder mounts through a portal, so the buttons live on the body, not
// under the host it was rendered into.
const button = (_el: HTMLElement, text: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as
    | HTMLButtonElement
    | undefined;

describe("the builder header", () => {
  it("has Back, Save and Publish, and Save stays open", async () => {
    const onSave = vi.fn(async () => {});
    const onClose = vi.fn();
    const el = mount({ onSave, onClose, onPublish: async () => {} });
    expect(button(el, "← Back")).toBeDefined();
    expect(button(el, "Discard")).toBeUndefined();
    expect(button(el, "Publish")).toBeDefined();
    await act(async () => button(el, "Save")!.click());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("publish saves first, then publishes", async () => {
    const order: string[] = [];
    const el = mount({
      onSave: async () => {
        order.push("save");
      },
      onPublish: async () => {
        order.push("publish");
      },
    });
    await act(async () => button(el, "Publish")!.click());
    expect(order).toEqual(["save", "publish"]);
  });

  it("a failed save stops the publish and stays open, with the reason", async () => {
    const onPublish = vi.fn(async () => {});
    const onClose = vi.fn();
    const el = mount({
      onSave: async () => {
        throw new Error("Hero: changed by someone else");
      },
      onPublish,
      onClose,
    });
    await act(async () => button(el, "Publish")!.click());
    expect(onPublish).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("changed by someone else");
  });

  it("Cmd+S saves", async () => {
    const onSave = vi.fn(async () => {});
    mount({ onSave });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true }));
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("without onSave it still says Done and closes", async () => {
    const onClose = vi.fn();
    const el = mount({ onClose });
    await act(async () => button(el, "Done")!.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

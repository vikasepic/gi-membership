// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BlockEditor } from "@/components/admin/block-editor";
import { bandTheme } from "@/lib/page-sections";
import { newBlock, type Block } from "@/lib/blocks";

// The press that tells the two shelves apart.
//
// Everything else in the library makes a COPY: the blocks land on the page and
// the page owns them from then on. A global must not — what lands is a pointer,
// and the design's own blocks must stay where they are, or the link is a lie
// and the next edit reaches nothing.

const theme = bandTheme("navy");

let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const root = mounted;
  mounted = null;
  if (root) act(() => root.unmount());
  vi.unstubAllGlobals();
});

const promise = <T,>(v: T) => ({ ok: true, json: () => Promise.resolve(v) });

function mount(shelf: unknown[]) {
  // The tiles measure themselves to scale a whole design into a small box.
  // jsdom has no layout, so there is nothing to observe — a no-op keeps the
  // preview from throwing on mount, and the press below is what is under test.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(promise({ templates: shelf }))),
  );
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  let blocks: Block[] = [];
  const render = () =>
    act(() => {
      root.render(
        <BlockEditor
          blocks={blocks}
          theme={theme}
          title="Hero"
          onClose={() => {}}
          onChange={(next) => {
            blocks = next;
            render();
          }}
        />,
      );
    });
  render();
  return {
    get blocks() {
      return blocks;
    },
  };
}

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

const byText = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

/** Open the popup and let the shelf's fetch settle. */
async function openLibrary() {
  const open = byText("Add from library");
  expect(open).toBeTruthy();
  click(open!);
  await act(async () => {
    await Promise.resolve();
  });
}

const shelfEntry = (kind: "template" | "global", name: string) => ({
  id: `${kind}:11111111-1111-1111-1111-111111111111`,
  savedId: "11111111-1111-1111-1111-111111111111",
  kind,
  name,
  group: "Saved",
  blocks: [{ ...newBlock("heading"), props: { text: "The shared promise", tag: "h2" } }],
  updatedAt: "",
});

describe("adding a global from the library", () => {
  it("drops a pointer rather than the design's blocks", async () => {
    const editor = mount([shelfEntry("global", "Guarantee")]);
    await openLibrary();

    const add = byText("Link");
    expect(add, "a global's button says Link, not Add").toBeTruthy();
    click(add!);

    expect(editor.blocks).toHaveLength(1);
    expect(editor.blocks[0].type).toBe("global");
    expect(editor.blocks[0].props.globalId).toBe("11111111-1111-1111-1111-111111111111");
    // The design itself stayed where it is. Copying it in would look identical
    // on screen today and stop tracking the design tomorrow.
    expect(JSON.stringify(editor.blocks)).not.toContain("The shared promise");
  });

  it("still copies a saved template in", async () => {
    // The other half of the same press, so the branch cannot quietly swallow
    // every insert.
    const editor = mount([shelfEntry("template", "Hero copy")]);
    await openLibrary();

    click(byText("Add")!);

    expect(editor.blocks).toHaveLength(1);
    expect(editor.blocks[0].type).toBe("heading");
    expect(editor.blocks[0].props.text).toBe("The shared promise");
  });
});

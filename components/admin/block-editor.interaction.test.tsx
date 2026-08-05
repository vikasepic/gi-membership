// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BlockEditor } from "@/components/admin/block-editor";
import { bandTheme } from "@/lib/page-sections";
import { newBlock, type Block } from "@/lib/blocks";

const theme = bandTheme("navy");

// See curriculum.test.tsx: an unmounted root keeps React scheduling past the
// end of the file, and the environment is not there when it runs.
let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const root = mounted;
  mounted = null;
  if (root) act(() => root.unmount());
});

function mount(initial: Block[]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  let blocks = initial;
  const render = () =>
    act(() => {
      root.render(
        <BlockEditor
          blocks={blocks}
          theme={theme}
          title="Hero"
          onClose={() => {}}
          onChange={(next) => { blocks = next; render(); }}
        />,
      );
    });
  render();
  return { get blocks() { return blocks; } };
}

const click = (el: Element) =>
  act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

describe("editing in the canvas", () => {
  it("selecting a heading by clicking it opens its controls", () => {
    const h = { ...newBlock("heading"), props: { text: "Click me", tag: "h2" } };
    mount([h]);
    const node = [...document.querySelectorAll("h2")].find((x) => x.textContent === "Click me")!;
    expect(node, "heading rendered on the canvas").toBeTruthy();
    click(node);
    const inspector = document.body.textContent ?? "";
    expect(inspector, "inspector should stop saying 'Select a block'").not.toContain("Select a block to edit it.");
  });

  it("selecting a text block by clicking it opens its controls", () => {
    document.body.innerHTML = "";
    const t = { ...newBlock("text"), props: { html: "<p>Some words</p>" } };
    mount([t]);
    const node = [...document.querySelectorAll("p")].find((x) => x.textContent === "Some words")!;
    click(node);
    expect(document.body.textContent ?? "").not.toContain("Select a block to edit it.");
  });

  it("becomes editable once selected, and saves what you type", () => {
    document.body.innerHTML = "";
    const h = { ...newBlock("heading"), props: { text: "Before", tag: "h2" } };
    const state = mount([h]);
    // Not editable until it is the selected block.
    expect(document.querySelector('[contenteditable="true"]')).toBeNull();
    click([...document.querySelectorAll("h2")].find((x) => x.textContent === "Before")!);
    const editable = document.querySelector('[contenteditable="true"]');
    expect(editable, "selected heading should be contenteditable").toBeTruthy();
    act(() => {
      (editable as HTMLElement).textContent = "After";
      // React's onBlur listens for focusout, not blur.
      editable!.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(state.blocks[0].props.text).toBe("After");
  });

  it("opens the controls for every kind of block when you click it", () => {
    for (const type of ["heading", "text", "button", "iconlist", "cards", "faq", "pricecard", "divider"] as const) {
      document.body.innerHTML = "";
      const b = newBlock(type);
      const filled = { ...b, props: { ...b.props, items: [{ title: "a", body: "b", q: "a", a: "b", text: "a" }] } };
      mount([filled]);
      const node = document.querySelector("[data-block]")!;
      click(node.querySelector("h1,h2,h3,p,span,ul,div,hr") ?? node);
      expect(document.body.textContent ?? "", type).not.toContain("Select a block to edit it.");
    }
  });

  it("typing in the inspector changes the block", () => {
    document.body.innerHTML = "";
    const b = { ...newBlock("heading"), props: { text: "Old", tag: "h2" } };
    const state = mount([b]);
    click([...document.querySelectorAll("h2")].find((x) => x.textContent === "Old")!);
    const field = [...document.querySelectorAll("textarea")].find(
      (t) => (t as HTMLTextAreaElement).value === "Old",
    ) as HTMLTextAreaElement;
    expect(field, "the Heading field should hold the current text").toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(field, "New");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(state.blocks[0].props.text).toBe("New");
  });

  it("deleting a block removes it", () => {
    document.body.innerHTML = "";
    const b = { ...newBlock("heading"), props: { text: "Bye", tag: "h2" } };
    const state = mount([b]);
    click([...document.querySelectorAll("h2")].find((x) => x.textContent === "Bye")!);
    click(document.querySelector('[aria-label="Delete"]')!);
    expect(state.blocks).toHaveLength(0);
  });

  it("clicking a palette item adds that block", () => {
    document.body.innerHTML = "";
    const state = mount([]);
    const btn = [...document.querySelectorAll("button")].find((x) => x.textContent === "Heading")!;
    click(btn);
    expect(state.blocks).toHaveLength(1);
    expect(state.blocks[0].type).toBe("heading");
  });
});

describe("dropping into a column", () => {
  // Both bugs this covers were live: the words "Drop here" sat outside the
  // drop zone so the visible target accepted nothing, and the zone did not
  // stop the event, so the row containing the column handled it too and put
  // the block beside the row instead of inside it.
  const rowWith = (): Block[] => {
    const row = newBlock("row");
    row.id = "row1";
    return [row, { ...newBlock("heading"), id: "h1", props: { text: "Move me", tag: "h2" } }];
  };

  const dragTo = (target: Element) => {
    const dt = { effectAllowed: "", setData() {}, getData() { return ""; } };
    const grip = [...document.querySelectorAll("[draggable='true']")].find((g) =>
      (g.getAttribute("title") ?? "").includes("Heading"),
    )!;
    act(() => {
      grip.dispatchEvent(Object.assign(new Event("dragstart", { bubbles: true }), { dataTransfer: dt }));
      target.dispatchEvent(Object.assign(new Event("dragover", { bubbles: true, cancelable: true }), { dataTransfer: dt }));
      target.dispatchEvent(Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer: dt }));
    });
  };

  it("puts the block inside the column, not beside the row", () => {
    document.body.innerHTML = "";
    const state = mount(rowWith());
    const col = document.querySelector('[data-zone="row1:0"]')!;
    expect(col, "column zone should exist").toBeTruthy();
    dragTo(col);
    expect(state.blocks).toHaveLength(1);
    expect(state.blocks[0].type).toBe("row");
    expect(state.blocks[0].columns![0].map((b) => b.id)).toEqual(["h1"]);
  });

  it("accepts a drop on the words that say to drop there", () => {
    document.body.innerHTML = "";
    const state = mount(rowWith());
    const label = [...document.querySelectorAll("p")].find((p) => p.textContent === "Drop here")!;
    expect(label, "the empty column should say Drop here").toBeTruthy();
    // The label cannot take the event itself, so the zone below it does.
    expect(label.className).toContain("pointer-events-none");
    dragTo(document.querySelector('[data-zone="row1:1"]')!);
    expect(state.blocks[0].columns![1].map((b) => b.id)).toEqual(["h1"]);
  });

  it("shows the column is the target while dragging over it", () => {
    document.body.innerHTML = "";
    mount(rowWith());
    const col = document.querySelector('[data-zone="row1:0"]') as HTMLElement;
    const dt = { effectAllowed: "", setData() {}, getData() { return ""; } };
    const grip = [...document.querySelectorAll("[draggable='true']")].find((g) =>
      (g.getAttribute("title") ?? "").includes("Heading"),
    )!;
    act(() => {
      grip.dispatchEvent(Object.assign(new Event("dragstart", { bubbles: true }), { dataTransfer: dt }));
      col.dispatchEvent(Object.assign(new Event("dragover", { bubbles: true, cancelable: true }), { dataTransfer: dt }));
    });
    expect((document.querySelector('[data-zone="row1:0"]') as HTMLElement).style.outline).toContain("2px");
  });

  it("still drops on the canvas root", () => {
    document.body.innerHTML = "";
    const state = mount([{ ...newBlock("heading"), id: "h1", props: { text: "Move me", tag: "h2" } }]);
    dragTo(document.querySelector('[data-zone="root"]')!);
    expect(state.blocks).toHaveLength(1);
    expect(state.blocks[0].id).toBe("h1");
  });
});

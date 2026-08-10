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

const rightClick = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });

const menuItems = () =>
  [...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent?.trim() ?? "");

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

  it("deleting a block takes two clicks, and removes it on the second", () => {
    // Undo exists, but a block removed by a mis-aimed click on a 24px target is
    // one you have to notice before you can undo it.
    document.body.innerHTML = "";
    const b = { ...newBlock("heading"), props: { text: "Bye", tag: "h2" } };
    const state = mount([b]);
    click([...document.querySelectorAll("h2")].find((x) => x.textContent === "Bye")!);

    click(document.querySelector('[aria-label="Delete"]')!);
    expect(state.blocks, "still there after the first click").toHaveLength(1);

    click([...document.querySelectorAll("button")].find((x) => x.textContent === "Delete it")!);
    expect(state.blocks).toHaveLength(0);
  });

  it("goes back to asking once a different block is selected", () => {
    // A pending "Delete it" must never land on a block you have since clicked.
    document.body.innerHTML = "";
    const state = mount([
      { ...newBlock("heading"), id: "a", props: { text: "One", tag: "h2" } },
      { ...newBlock("heading"), id: "b", props: { text: "Two", tag: "h2" } },
    ]);
    click([...document.querySelectorAll("h2")].find((x) => x.textContent === "One")!);
    click(document.querySelector('[aria-label="Delete"]')!);
    click([...document.querySelectorAll("h2")].find((x) => x.textContent === "Two")!);
    expect([...document.querySelectorAll("button")].some((x) => x.textContent === "Delete it")).toBe(
      false,
    );
    expect(state.blocks).toHaveLength(2);
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


/**
 * Right-clicking a block.
 *
 * Rendered markup cannot answer this: the menu only exists once a contextmenu
 * event has actually been dispatched at a block, and it lands in a portal
 * outside the editor's own tree.
 */
describe("the block context menu", () => {
  it("opens on a right-click, with the same things the toolbar offers", () => {
    mount([newBlock("text")]);
    rightClick(document.querySelector("[data-block]")!);
    const items = menuItems();
    expect(items).toContain("Copy");
    expect(items).toContain("Duplicate");
    expect(items).toContain("Delete");
  });

  it("deletes the block it was opened on", () => {
    const editor = mount([newBlock("text"), newBlock("heading")]);
    rightClick(document.querySelector("[data-block]")!);
    click([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.trim() === "Delete")!);
    expect(editor.blocks).toHaveLength(1);
    expect(editor.blocks[0].type).toBe("heading");
  });

  it("duplicates from the menu", () => {
    const editor = mount([newBlock("text")]);
    rightClick(document.querySelector("[data-block]")!);
    click([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.trim() === "Duplicate")!);
    expect(editor.blocks).toHaveLength(2);
  });

  it("says why paste is unavailable rather than hiding it", () => {
    // An option that vanishes is one people assume was never there.
    mount([newBlock("text")]);
    rightClick(document.querySelector("[data-block]")!);
    expect(menuItems().some((t) => t.startsWith("Paste"))).toBe(true);
  });
});

/**
 * Selecting a column from the structure tree.
 *
 * The canvas only selects a column where nothing is drawn over it, so a column
 * with blocks in it cannot be reached there at all — and its background,
 * padding and corner have been editable but unreachable the whole time.
 */
describe("selecting a column", () => {
  const openTree = () =>
    click([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Structure")!);

  const inspector = () => document.querySelectorAll("aside")[1]?.textContent ?? "";

  const rowOf = (...cols: Block[][]) => {
    const row = newBlock("row");
    row.columns = cols;
    return row;
  };

  it("opens the column's own controls from the tree, not the block's", () => {
    mount([rowOf([newBlock("heading")], [newBlock("text")])]);
    openTree();
    const col2 = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Column 2");
    expect(col2, "a column with blocks in it still gets a row in the tree").toBeTruthy();
    click(col2!);

    const panel = inspector();
    expect(panel).toContain("Column 2");
    // The three settings the bug report says exist but cannot be reached.
    expect(panel).toContain("Background");
    expect(panel).toContain("Padding");
    expect(panel).toContain("Corner");
    // If the click had landed on the text block inside it, the panel would
    // offer the row's own layout instead — the failure this replaces.
    expect(panel).not.toContain("Vertical align");
  });

  it("still right-clicks the blocks inside a column", () => {
    // The column row sits between the row and its children in the markup; a
    // wrong nesting there silently drops the children's menu.
    mount([rowOf([newBlock("text")], [])]);
    openTree();
    const child = [...document.querySelectorAll("aside button")].find(
      (b) => b.textContent?.trim() === "Text",
    )!;
    rightClick(child);
    expect(menuItems()).toContain("Duplicate");
  });
});

describe("a card's picture", () => {
  it("is chosen from the library, not typed as a path", () => {
    // The one field on a card that names a file. Every other image on this
    // screen has a picker; typing a bucket path is how you get a broken image
    // and no way to tell which character is wrong.
    const b = newBlock("cards");
    mount([{ ...b, props: { ...b.props, items: [{ title: "a", body: "b", icon: "", image: "" }] } }]);
    click(document.querySelector("[data-block]")!);
    const panel = document.querySelectorAll("aside")[1]!;
    expect([...panel.querySelectorAll("button")].map((x) => x.textContent?.trim())).toContain("Select image");
  });
});

describe("the card layout chooser", () => {
  const cards = () => {
    const b = newBlock("cards");
    return { ...b, props: { ...b.props, items: [{ title: "a", body: "b", icon: "", image: "" }] } };
  };

  /**
   * Select the block and hand back the inspector's template buttons.
   *
   * Labelled by the last child rather than the button's own text: the preview
   * above the label is drawn markup, and the "keep" one draws a dash.
   */
  const label = (b: Element) => b.lastElementChild?.textContent?.trim() ?? "";
  const open = () => {
    click(document.querySelector("[data-block]")!);
    const panel = document.querySelectorAll("aside")[1]!;
    return [...panel.querySelectorAll("button")].filter((x) =>
      ["Tiles", "Rows", "Keep what I have"].includes(label(x)),
    );
  };

  it("offers both looks and a way to keep neither, on the Content tab", () => {
    // Rendered, not asserted from the table: a chooser nobody can reach is a
    // table with a test passing over it.
    mount([cards()]);
    expect(open().map(label)).toEqual(["Tiles", "Rows", "Keep what I have"]);
  });

  it("applies a look without touching a word on the cards", () => {
    const editor = mount([cards()]);
    click(open()[1]!);
    expect(editor.blocks[0].props).toMatchObject({ skin: "plain", columns: 1, divider: true });
    expect(editor.blocks[0].props.items).toEqual([{ title: "a", body: "b", icon: "", image: "" }]);
  });

  it("is one press to undo", () => {
    // Applying a template writes a dozen keys. If they landed as a dozen steps,
    // Ctrl+Z would walk back through a layout nobody ever saw.
    const editor = mount([cards()]);
    click(open()[0]!);
    expect(editor.blocks[0].props.columns).toBe(4);
    const undo = [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label")?.startsWith("Undo"),
    )!;
    click(undo);
    expect(editor.blocks[0].props.columns).toBe(3);
  });

  it("does not offer it on a block that has no cards", () => {
    mount([newBlock("text")]);
    click(document.querySelector("[data-block]")!);
    expect(document.querySelectorAll("aside")[1]!.textContent).not.toContain("Keep what I have");
  });
});

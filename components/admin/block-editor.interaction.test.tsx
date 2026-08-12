// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BlockEditor } from "@/components/admin/block-editor";
import { bandTheme } from "@/lib/page-sections";
import { newBlock, setColumnCount, setStyleAt, type Block } from "@/lib/blocks";
import { normalizeSiteTypography } from "@/lib/site-typography";
import { BLOCK_CONTROLS, writeControl, type Control } from "@/lib/block-controls";
import { blockRules } from "@/lib/block-style";
import { Blocks } from "@/components/page/blocks";
import { renderToStaticMarkup } from "react-dom/server";

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

  // "Column 1 — empty" when it holds nothing, so the label is a prefix.
  const pickColumn = (n: number) =>
    click([...document.querySelectorAll("button")].find((b) => b.textContent?.startsWith(`Column ${n}`))!);

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
    // offer the row's own layout instead — the failure this replaces. The
    // control is called "Align items"; the old spelling was renamed and this
    // assertion had quietly become one no change could fail.
    expect(panel).not.toContain("Align items");
  });

  it("opens the same panel when the column is clicked on the canvas", () => {
    // Two routes to one selection. The canvas one forced the Content tab, and a
    // column has no Content tab — so the panel came up empty and the click read
    // as having done nothing.
    mount([rowOf([], [])]);
    // The empty space inside a column is the only place a click means the
    // column, and the hover outline is what marks that element.
    const col = document.querySelector('[data-block] div[class*="hover:outline-offset-1"]')!;
    click(col);
    expect(inspector()).toContain("Column 1");
    expect(inspector()).toContain("Padding");
  });

  it("offers a column only the settings its own values make live", () => {
    // Every `when` on COLUMN_CONTROLS was inert: the panel showed a classic
    // background's fields beside a gradient's, and a custom width's number on a
    // column set to Full.
    mount([rowOf([], [])]);
    openTree();
    pickColumn(1);
    const panel = inspector();
    expect(panel).not.toContain("Colour one");
    expect(panel).not.toContain("Custom width");
    // The width's Unit, which only means anything once Width is Custom.
    expect(panel).not.toContain("Unit");
    // Twice was a duplicate React key and two identical fields.
    expect(panel.split("Darken").length - 1).toBe(0);
  });

  /**
   * Set a control in the column's panel and hand back what the row stored.
   *
   * Through the panel rather than through `setColumnStyle` directly: the writer
   * that unwraps a column's edit back onto its row, and the device it writes at,
   * are both editor code, and nothing else exercises them.
   */
  const setInPanel = (editor: { blocks: Block[] }, label: string, value: string) => {
    const input = document
      .querySelectorAll("aside")[1]!
      .querySelector(`input[aria-label="${label} value"]`) as HTMLInputElement;
    act(() => {
      // React tracks the DOM value it last wrote, so a plain assignment looks
      // like no change at all and the event is swallowed.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return editor.blocks[0].columnStyles?.[0];
  };

  const pin = (device: string) =>
    click([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === device)!);

  it("writes a column's edit at the width that is pinned, not at desktop", () => {
    // The panel showed Mobile and wrote desktop, so setting a column's corner on
    // a phone repainted the laptop.
    const editor = mount([rowOf([], [])]);
    openTree();
    pickColumn(1);
    pin("Mobile");
    const stored = setInPanel(editor, "Corner", "24");
    expect(stored?.responsive?.mobile.style.radius).toBe(24);
    expect(stored?.radius).toBe(0);
  });

  it("puts what a column is given on the page, as a rule and not an attribute", () => {
    // An attribute has no media query and outranks the one the stylesheet emits,
    // so a column painted on mobile only would never reach a phone.
    // Filled, or the row renders nothing on a live page and the markup this
    // asserts on is empty whatever the column was given.
    const editor = mount([rowOf([{ ...newBlock("heading"), props: { text: "Hi", tag: "h2" } }], [])]);
    openTree();
    pickColumn(1);
    setInPanel(editor, "Corner", "18");
    const row = editor.blocks[0];
    // The emitted rules ride along in a <style> element, which is the whole
    // point — so the attributes are what is checked, with that stripped out.
    const attributes = renderToStaticMarkup(<Blocks blocks={[row]} theme={theme} />).replace(
      /<style>[\s\S]*?<\/style>/g,
      "",
    );
    expect(blockRules(row, theme)).toContain("border-radius:18px");
    expect(attributes).not.toContain("border-radius:18px");
  });

  it("outlines a grid's cells and only a grid's, and still says they are clickable", () => {
    // A grid's cells have no edges of their own, so the dashed box is the only
    // thing saying where a track ends. On a flex line the columns already show
    // their own width, and outlining those would be a border nobody asked for.
    const cells = () =>
      [...document.querySelectorAll('[data-block] div[class*="outline-dashed"]')].map((d) => d.className);
    const row = rowOf([], []);
    mount([{ ...row, props: { ...row.props, containerType: "grid" } }]);
    expect(cells()).toHaveLength(2);
    // The dashed box reads as decoration, so it cannot also be the only cue
    // that the thing under the cursor can be selected.
    expect(cells().every((c) => c.includes("hover:outline-[var(--primary)]"))).toBe(true);
  });

  it("draws no dashed outline on a flex container", () => {
    mount([rowOf([], [])]);
    expect(document.querySelector('[data-block] div[class*="outline-dashed"]')).toBeNull();
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
  const withMedia = (media: string) => {
    const b = newBlock("cards");
    mount([{ ...b, props: { ...b.props, media, items: [{ title: "a", body: "b", icon: "", image: "" }] } }]);
    click(document.querySelector("[data-block]")!);
    return document.querySelectorAll("aside")[1]!;
  };

  it("is chosen from the library, not typed as a path", () => {
    // The one field on a card that names a file. Every other image on this
    // screen has a picker; typing a bucket path is how you get a broken image
    // and no way to tell which character is wrong.
    const panel = withMedia("image");
    expect([...panel.querySelectorAll("button")].map((x) => x.textContent?.trim())).toContain("Select image");
  });

  it("shows only the artwork field the card actually draws", () => {
    // Both fields used to sit on every card whichever was in use, so a card set
    // to Image carried an SVG box nothing on the page reads and nothing said so.
    expect(withMedia("image").textContent).not.toContain("Icon (SVG or image URL)");
  });

  it("keeps the other field's value when the switch is thrown", () => {
    // Hiding the row is not emptying it: switching back has to find what was
    // typed, or trying the other option is a way to lose work.
    const b = newBlock("cards");
    const items = [{ title: "a", body: "b", icon: "<svg/>", image: "" }];
    const media = (BLOCK_CONTROLS.cards.content.find((c) => "key" in c && c.key === "media") as Control)!;
    const next = writeControl({ ...b, props: { ...b.props, items } }, media, "image");
    expect((next.props.items as { icon: string }[])[0].icon).toBe("<svg/>");
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
      ["Tiles", "Rows"].includes(label(x)),
    );
  };

  it("offers both looks on the Content tab, and no third that does nothing", () => {
    // Rendered, not asserted from the table: a chooser nobody can reach is a
    // table with a test passing over it. The tab is clicked rather than assumed
    // to be the default, or a change of default makes the name a lie.
    mount([cards()]);
    click(document.querySelector("[data-block]")!);
    const tab = [...document.querySelectorAll("aside button")].find((b) => b.textContent === "content")!;
    click(tab);
    expect(open().map(label)).toEqual(["Tiles", "Rows"]);
    // The third button used to be "Keep what I have", whose own tooltip read
    // "Changes nothing". What replaced it is a word saying which one you are on.
    expect(document.querySelectorAll("aside")[1]!.textContent).not.toContain("Keep what I have");
  });

  it("says which layout the block is already on", () => {
    // The question the third button was badly answering. A block nobody has
    // adjusted matches neither template, and saying "Custom" is information —
    // the panel could not answer this at all before.
    const editor = mount([cards()]);
    click(document.querySelector("[data-block]")!);
    expect(document.querySelectorAll("aside")[1]!.textContent).toContain("Custom");
    click(open()[0]!);
    expect(editor.blocks[0].props.columns).toBe(4);
    expect(document.querySelectorAll("aside")[1]!.textContent).toContain("Tiles");
  });

  it("leaves Undo alone when you press the layout you are already on", () => {
    // Better than the test it replaces, which pressed a button that could never
    // change anything. This presses a REAL template twice: the second press
    // must not add a step to undo, or a chooser people press to compare looks
    // fills the history with layouts nobody ever saw.
    const editor = mount([cards()]);
    const undoBtn = () =>
      [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.startsWith("Undo"))!;
    click(open()[0]!);
    expect(editor.blocks[0].props.columns).toBe(4);
    click(undoBtn());
    click(undoBtn());
    const steps = () => undoBtn().hasAttribute("disabled");
    expect(steps()).toBe(true);
    click(open()[0]!);
    click(open()[0]!);
    click(undoBtn());
    // One press back is the block before the template, not between two
    // identical applications of it.
    expect(editor.blocks[0].props.columns).toBe(3);
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

describe("the canvas follows the width being edited", () => {
  // Rendered once at its default width, the preview stylesheet would look right
  // even with the device hardcoded to "desktop" — which is exactly the lie the
  // per-width work exists to stop. So this switches width and looks again.
  // The editor portals itself to the end of the body, so the markup to read is
  // the body's, not the host's.
  const canvas = () => document.body.innerHTML;

  function mountWithPreview(blocks: Block[]) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    mounted = root;
    act(() => {
      root.render(
        <BlockEditor
          blocks={blocks}
          theme={theme}
          title="Hero"
          onClose={() => {}}
          onChange={() => {}}
          preview={{
            fontCss: "",
            typography: normalizeSiteTypography({ h1: { desktop: { size: "41px" }, mobile: { size: "23px" } } }),
          }}
        />,
      );
    });
  }

  const toMobile = () =>
    click([...document.querySelectorAll("button")].find((b) => b.title?.startsWith("Mobile"))!);

  it("shows the phone's site type once the canvas is pinned to a phone", () => {
    mountWithPreview([newBlock("heading")]);
    expect(canvas()).toContain("h1{font-size:41px}");
    // Named as the whole rule, not as "23px": the device switch's tooltip says
    // "1023px and narrower", and a bare substring matches that.
    expect(canvas()).not.toContain("h1{font-size:23px}");
    toMobile();
    expect(canvas()).toContain("h1{font-size:23px}");
  });

  it("shows the phone's own block value, on the text and not just the wrapper", () => {
    // The block's rule is on its wrapper; the site's names the tag. Without the
    // arm that names the tag too, the canvas would show 23px on a heading the
    // block itself sets to 14px — the page would show 14px and the builder 23px.
    let b = setStyleAt(newBlock("heading"), "desktop", { size: 48 });
    b = setStyleAt(b, "mobile", { size: 14 });
    mountWithPreview([b]);
    expect(canvas()).toContain("font-size:48px");
    toMobile();
    expect(canvas()).toContain("font-size:14px");
    expect(canvas()).not.toContain("font-size:48px");
  });
});


/**
 * The canvas has to ask the same question the page asks.
 *
 * A cards grid is `grid-cols-1 @xl:grid-cols-[var(--cards)]` — a container
 * query. With no container ancestor it never matches, so the editor drew every
 * cards block as one stacked column whatever layout was chosen, while the live
 * page laid them out in four. Choosing Tiles and being shown a list is the
 * editor lying about the page.
 */
describe("the canvas measures itself, like the page does", () => {
  it("is a container query context", () => {
    mount([newBlock("cards")]);
    const canvas = document.querySelector("[data-zone]")?.closest(".\\@container");
    expect(canvas).not.toBeNull();
  });

  it("puts the cards grid inside it", () => {
    // The grid and the thing it measures against must be the same subtree, or
    // the query resolves against something the page does not have.
    mount([newBlock("cards")]);
    const grid = [...document.querySelectorAll("div")].find((d) =>
      d.className.includes("@xl:grid-cols-"),
    );
    expect(grid).toBeDefined();
    expect(grid!.closest(".\\@container")).not.toBeNull();
  });
});


const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === label);

/**
 * The way out of a preset.
 *
 * A layout is a bundle of settings, all editable — but the PARTS of a card are
 * fixed. This is the button that turns one cards block into a container of real
 * blocks so anything can be added, removed or reordered.
 */
describe("taking a cards block apart", () => {
  it("asks first, because it does not go back", () => {
    const editor = mount([newBlock("cards")]);
    click(document.querySelector('[data-block]')!.querySelector("h3, h2, p, div")!);
    const open = button("Take apart into blocks…");
    expect(open, "the way out should be offered on a cards block").toBeTruthy();
    click(open!);
    expect(document.body.textContent).toContain("You cannot turn them back into cards");
    // Still one cards block: asking is not doing.
    expect(editor.blocks).toHaveLength(1);
    expect(editor.blocks[0].type).toBe("cards");
  });

  it("cancelling leaves the block alone", () => {
    const editor = mount([newBlock("cards")]);
    click(document.querySelector('[data-block]')!);
    click(button("Take apart into blocks…")!);
    click(button("Cancel")!);
    expect(editor.blocks[0].type).toBe("cards");
    expect(button("Take apart")).toBeUndefined();
  });

  it("replaces the block with a container holding one column per card", () => {
    const editor = mount([newBlock("cards")]);
    click(document.querySelector('[data-block]')!);
    click(button("Take apart into blocks…")!);
    click(button("Take apart")!);

    expect(editor.blocks.every((b) => b.type !== "cards")).toBe(true);
    const rows = editor.blocks.filter((b) => b.type === "row");
    expect(rows.length).toBeGreaterThan(0);
    // Three starter cards, so three columns, each holding real blocks.
    const cols = rows.flatMap((r) => r.columns ?? []);
    expect(cols).toHaveLength(3);
    expect(cols.every((c) => c.some((b) => b.type === "heading"))).toBe(true);
  });

  it("leaves the panel pointing at something that still exists", () => {
    // The block being edited is gone. A panel still bound to it would be
    // editing a block no longer on the page.
    mount([newBlock("cards")]);
    click(document.querySelector('[data-block]')!);
    click(button("Take apart into blocks…")!);
    click(button("Take apart")!);
    expect(document.body.textContent).toContain("Select a block to edit it.");
  });

  it("is one step of undo, not several", () => {
    const editor = mount([newBlock("cards")]);
    click(document.querySelector('[data-block]')!);
    click(button("Take apart into blocks…")!);
    click(button("Take apart")!);
    click(document.querySelector('[aria-label="Undo (⌘Z)"]')!);
    expect(editor.blocks).toHaveLength(1);
    expect(editor.blocks[0].type).toBe("cards");
  });
});


/**
 * A slider needs coarse detents to be draggable. A typed number needs none.
 *
 * They shared one `step`, so the container's Gap moved in fours from the
 * keyboard as well as under the mouse, and 17px was a value the panel could
 * not produce at all.
 */
describe("the number controls", () => {
  const stepsOf = (label: string) => {
    const range = document.querySelector<HTMLInputElement>(`input[type="range"][aria-label="${label}"]`);
    const typed = document.querySelector<HTMLInputElement>(`input[type="number"][aria-label="${label} value"]`);
    return { slider: range?.getAttribute("step"), typed: typed?.getAttribute("step") };
  };

  it("lets the keyboard reach a value the slider skips", () => {
    mount([newBlock("row")]);
    click(document.querySelector("[data-block]")!);
    const gap = stepsOf("Gap");
    expect(gap.slider, "the slider keeps its detents").toBe("4");
    expect(gap.typed, "the typed field goes to the smallest unit").toBe("1");
  });

  it("does not coarsen a control that is already fine", () => {
    // Line height steps by 0.05. Rounding that to 1 would turn it into a
    // control that jumps from 1.5 to 2.5 — the opposite mistake.
    mount([newBlock("heading")]);
    click(document.querySelector("[data-block]")!);
    const styleTab = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "style",
    );
    expect(styleTab, "the Style tab").toBeTruthy();
    click(styleTab!);
    expect(stepsOf("Line height").typed).toBe("0.05");
  });
});


/**
 * Selecting a block that contains a link.
 *
 * The canvas draws the real thing, so a button with a href is a real `<a>`.
 * Left to its default a click on it navigates: an in-page href jumps the
 * editor, an external one leaves it, and either way the selection is lost and
 * the panel falls back to the section — which reads as "clicking the button
 * selects the section".
 */
describe("a link inside the canvas", () => {
  const linked = () => {
    const b = newBlock("button");
    return { ...b, id: "lk1", props: { ...b.props, text: "See how it works", link: "#how" } };
  };

  it("selects the block rather than following the link", () => {
    mount([linked()]);
    const a = [...document.querySelectorAll("a")].find((x) => x.textContent === "See how it works")!;
    expect(a, "the canvas draws a real anchor").toBeTruthy();

    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => { a.dispatchEvent(ev); });

    expect(ev.defaultPrevented, "the link must not navigate the admin").toBe(true);
    // And it still selected: the panel is the block's, not the section's.
    expect(document.body.textContent).not.toContain("band everything sits on");
  });

  it("still selects a block that holds no link at all", () => {
    mount([{ ...newBlock("heading"), props: { text: "Just a heading", tag: "h2" } }]);
    const h = [...document.querySelectorAll("h2")].find((x) => x.textContent === "Just a heading")!;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => { h.dispatchEvent(ev); });
    // Nothing to prevent here — preventing every click would break the parts
    // of the canvas that rely on one.
    expect(ev.defaultPrevented).toBe(false);
  });

  it("selects a button nested inside a container column", () => {
    // Where the report came from: the button sat in a two-column hero.
    const b = newBlock("button");
    const btn = { ...b, id: "btn1", props: { ...b.props, text: "Start 7-day free trial" } };
    const row = setColumnCount(newBlock("row"), 2);
    row.columns = [[btn], []];
    mount([row]);
    const el = [...document.querySelectorAll("span,a")].find((x) => x.textContent === "Start 7-day free trial")!;
    act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(document.body.textContent).not.toContain("band everything sits on");
  });
});

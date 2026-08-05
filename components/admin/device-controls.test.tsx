// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BlockEditor } from "@/components/admin/block-editor";
import { bandTheme } from "@/lib/page-sections";
import { newBlock, setStyleAt, styleFor, type Block } from "@/lib/blocks";
import { controlsFor, isGroup, scopeOf } from "@/lib/block-controls";

// Editing a block at three widths, from the panel rather than from the model.

const theme = bandTheme("paper");

let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const root = mounted;
  mounted = null;
  if (root) act(() => root.unmount());
});

function mount(initial: Block[]) {
  const host = document.createElement("div");
  document.body.innerHTML = "";
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
          onChange={(next) => {
            blocks = next;
            render();
          }}
        />,
      );
    });
  render();
  return { get blocks() { return blocks; } };
}

const click = (el: Element | null | undefined) => {
  if (!el) throw new Error("nothing to click");
  act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
};
const byText = (sel: string, text: string) =>
  [...document.querySelectorAll(sel)].find((e) => e.textContent?.trim() === text);
const tab = (name: string) => byText("button", name);
const selectFirstBlock = () => click(document.querySelector("[data-block]"));

/**
 * Move a slider the way a person does.
 *
 * Assigning `.value` is not enough: React remembers the last value it set and
 * treats an unchanged one as no event, so the handler never fires. The native
 * setter is what a real drag goes through.
 */
function drag(el: HTMLInputElement | null, to: number) {
  if (!el) throw new Error("no slider");
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    set.call(el, String(to));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("the device switch", () => {
  it("offers the three widths the CSS actually breaks at", () => {
    mount([newBlock("heading")]);
    for (const d of ["Desktop", "Tablet", "Mobile"]) expect(tab(d), d).toBeTruthy();
  });

  it("starts on desktop", () => {
    mount([newBlock("heading")]);
    expect(tab("Desktop")?.getAttribute("aria-pressed")).toBe("true");
    expect(tab("Mobile")?.getAttribute("aria-pressed")).toBe("false");
  });

  it("narrows the canvas to the width being edited", () => {
    mount([newBlock("heading")]);
    const canvas = () =>
      [...document.querySelectorAll("div")].find((d) => d.style.maxWidth)?.style.maxWidth;
    const wide = canvas();
    click(tab("Mobile"));
    expect(canvas()).toBe("390px");
    expect(canvas()).not.toBe(wide);
  });
});

describe("what a control writes", () => {
  it("changes desktop when desktop is showing", () => {
    const editor = mount([newBlock("heading")]);
    selectFirstBlock();
    click(tab("style"));
    drag(document.querySelector<HTMLInputElement>('input[type="range"]'), 40);
    expect(editor.blocks[0].style.size).toBe(40);
    expect(editor.blocks[0].responsive).toBeUndefined();
  });

  it("changes only the phone when the phone is showing", () => {
    const editor = mount([setStyleAt(newBlock("heading"), "desktop", { size: 48 })]);
    selectFirstBlock();
    click(tab("Mobile"));
    click(tab("style"));
    drag(document.querySelector<HTMLInputElement>('input[type="range"]'), 28);
    expect(styleFor(editor.blocks[0], "mobile").size).toBe(28);
    expect(editor.blocks[0].style.size).toBe(48);
  });

  it("says which control is holding a value for this width", () => {
    const editor = mount([setStyleAt(setStyleAt(newBlock("heading"), "desktop", { size: 48 }), "mobile", { size: 28 })]);
    selectFirstBlock();
    click(tab("Mobile"));
    click(tab("style"));
    // The badge is the only thing that distinguishes "28 because the phone says
    // so" from "28 because everything is 28".
    expect(byText("button", "mobile ✕")).toBeTruthy();
    click(byText("button", "mobile ✕"));
    expect(editor.blocks[0].responsive).toBeUndefined();
  });

  it("does not offer the badge on desktop, which has nothing to fall back to", () => {
    mount([setStyleAt(newBlock("heading"), "desktop", { size: 48 })]);
    selectFirstBlock();
    click(tab("style"));
    expect(byText("button", "desktop ✕")).toBeFalsy();
  });

  it("does not offer it on content either — words are the same at every width", () => {
    mount([newBlock("heading")]);
    selectFirstBlock();
    click(tab("Mobile"));
    click(tab("content"));
    expect(byText("button", "mobile ✕")).toBeFalsy();
  });
});

describe("every style control can be set per device", () => {
  // The badge lives in one label builder. It drifted once already, when three
  // control kinds hand-rolled their own label and silently lost it.
  const kinds = new Set(
    controlsFor(newBlock("heading"))
      .style.concat(controlsFor(newBlock("heading")).advanced)
      .filter((c) => !isGroup(c) && scopeOf(c) === "style")
      .map((c) => c.kind),
  );

  it("covers more than one kind of control, or this test proves nothing", () => {
    expect(kinds.size).toBeGreaterThan(2);
  });

  it("shows the badge whatever the control looks like", () => {
    const fields = controlsFor(newBlock("heading")).style.flatMap((x) =>
      isGroup(x) || scopeOf(x) !== "style" ? [] : [x],
    );
    for (const c of fields) {
      const key = c.key.split(".")[0] as keyof Block["style"];
      const base = newBlock("heading");
      const b = setStyleAt(base, "mobile", { [key]: base.style[key] } as never);
      mount([b]);
      selectFirstBlock();
      click(tab("Mobile"));
      click(tab("style"));
      expect(byText("button", "mobile ✕"), `${c.kind}:${c.key}`).toBeTruthy();
      act(() => { mounted?.unmount(); });
      mounted = null;
    }
  });
});

describe("managing columns", () => {
  const rowWith = (props: Record<string, unknown> = {}, cols = 2): Block => {
    const b = newBlock("row");
    return { ...b, props: { ...b.props, ...props }, columns: Array.from({ length: cols }, () => []) };
  };
  const widthFields = () =>
    [...document.querySelectorAll<HTMLInputElement>('input[type="number"]')];
  const type = (el: HTMLInputElement, to: number) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      set.call(el, String(to));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const pick = (el: HTMLSelectElement, value: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    act(() => {
      set.call(el, value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };
  const open = (initial: Block[]) => {
    const editor = mount(initial);
    click(document.querySelector("[data-block]"));
    return editor;
  };

  it("offers a width field per column", () => {
    open([rowWith({}, 3)]);
    expect(widthFields()).toHaveLength(3);
  });

  it("resizes one column and keeps the row adding up", () => {
    const editor = open([rowWith({ widths: [50, 50] })]);
    type(widthFields()[0], 70);
    expect(editor.blocks[0].props.widths).toEqual([70, 30]);
  });

  it("changes how many columns there are", () => {
    const editor = open([rowWith({}, 2)]);
    const count = [...document.querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.textContent?.includes("column")),
    )!;
    pick(count, "4");
    expect(editor.blocks[0].columns).toHaveLength(4);
    expect(widthFields()).toHaveLength(4);
  });

  it("shows the phone as stacked, not as the desktop widths", () => {
    // The panel has to agree with the canvas: on mobile the row is one column
    // per line until someone says otherwise, so the fields read 100.
    open([rowWith({ widths: [60, 40] })]);
    click(tab("Mobile"));
    expect(widthFields().map((f) => Number(f.value))).toEqual([100, 100]);
  });

  it("writes a phone-only width, leaving the desktop row alone", () => {
    const editor = open([rowWith({ widths: [60, 40] })]);
    click(tab("Mobile"));
    type(widthFields()[0], 50);
    expect(editor.blocks[0].props.widths).toEqual([60, 40]);
    expect(styleFor(editor.blocks[0], "mobile")).toBeTruthy();
    expect(editor.blocks[0].responsive?.mobile.props.widths).toEqual([50, 50]);
  });

  it("keeps the column count out of the per-device overrides", () => {
    // Columns hold content. A phone with fewer of them would have nowhere to
    // put what the desktop wrote, so the count is one number for all widths.
    const editor = open([rowWith({}, 2)]);
    click(tab("Mobile"));
    const count = [...document.querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.textContent?.includes("column")),
    )!;
    pick(count, "3");
    expect(editor.blocks[0].columns).toHaveLength(3);
    expect(editor.blocks[0].responsive?.mobile.props.columnCount).toBeUndefined();
  });

  it("reverses the order for one device only", () => {
    const editor = open([rowWith({}, 2)]);
    click(tab("Mobile"));
    const reverse = [...document.querySelectorAll("label")].find((l) =>
      l.textContent?.includes("Reverse"),
    )?.querySelector("input");
    click(reverse);
    expect(editor.blocks[0].props.reverse).not.toBe(true);
    expect(editor.blocks[0].responsive?.mobile.props.reverse).toBe(true);
  });
});

describe("undo and redo", () => {
  const press = (key: string, mods: { meta?: boolean; shift?: boolean; ctrl?: boolean } = {}) =>
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          metaKey: mods.meta ?? false,
          ctrlKey: mods.ctrl ?? false,
          shiftKey: mods.shift ?? false,
          bubbles: true,
        }),
      );
    });
  const button = (label: string) =>
    document.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`);

  it("takes back an added block", () => {
    const editor = mount([newBlock("heading")]);
    click([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Text"));
    expect(editor.blocks).toHaveLength(2);
    press("z", { meta: true });
    expect(editor.blocks).toHaveLength(1);
  });

  it("puts it back with shift", () => {
    const editor = mount([newBlock("heading")]);
    click([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Text"));
    press("z", { meta: true });
    press("z", { meta: true, shift: true });
    expect(editor.blocks).toHaveLength(2);
  });

  it("takes Ctrl+Y too", () => {
    const editor = mount([newBlock("heading")]);
    click([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Text"));
    press("z", { ctrl: true });
    press("y", { ctrl: true });
    expect(editor.blocks).toHaveLength(2);
  });

  it("takes back a deleted block, which is the one that matters", () => {
    const editor = mount([newBlock("heading"), newBlock("text")]);
    click(document.querySelector("[data-block]"));
    click(button("Delete"));
    expect(editor.blocks).toHaveLength(1);
    press("z", { meta: true });
    expect(editor.blocks).toHaveLength(2);
  });

  it("has buttons, because a shortcut nobody knows about is not an undo", () => {
    mount([newBlock("heading")]);
    expect(button("Undo")?.disabled).toBe(true);
    click([...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Text"));
    expect(button("Undo")?.disabled).toBe(false);
    expect(button("Redo")?.disabled).toBe(true);
  });

  it("undoes a whole slider drag in one step", () => {
    const editor = mount([newBlock("heading")]);
    click(document.querySelector("[data-block]"));
    click(tab("style"));
    const slider = document.querySelector<HTMLInputElement>('input[type="range"]')!;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    for (const v of [20, 30, 40]) {
      act(() => {
        set.call(slider, String(v));
        slider.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    expect(editor.blocks[0].style.size).toBe(40);
    press("z", { meta: true });
    expect(editor.blocks[0].style.size).toBeNull();
  });

  it("does nothing when there is nothing to take back", () => {
    const editor = mount([newBlock("heading")]);
    const before = editor.blocks;
    press("z", { meta: true });
    expect(editor.blocks).toBe(before);
  });
});

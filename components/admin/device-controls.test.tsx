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

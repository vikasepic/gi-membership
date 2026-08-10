// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockEditor } from "@/components/admin/block-editor";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { blockClass } from "@/lib/block-style";
import { newBlock, type Block } from "@/lib/blocks";

// Block position moves a block on the page and had to move it in the canvas.
//
// Not a pixel comparison — jsdom lays nothing out. The check is the one thing
// the two renderers disagreed about: what kind of box holds the block. `Blocks`
// is a column flex container, so a wrapper with `margin-inline: auto` is a flex
// item and shrinks to its contents; the canvas held it in an ordinary block
// box, which fills its parent and leaves the auto margins nothing to take.
// Same container, same answer.

const theme = bandTheme("paper");

let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const root = mounted;
  mounted = null;
  if (root) act(() => root.unmount());
});

/** The builder, on a real DOM — its overlay is a portal and cannot be a string. */
function canvas(blocks: Block[]): void {
  document.body.innerHTML = "";
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  mounted = root;
  act(() => {
    root.render(
      <BlockEditor blocks={blocks} theme={theme} title="Hero" onChange={() => {}} onClose={() => {}} />,
    );
  });
}

/** The same blocks, rendered as a buyer gets them. */
function page(blocks: Block[]): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<Blocks blocks={blocks} theme={theme} />);
  return host;
}

/** The element a block's own style lands on, in either renderer. */
function wrapper(root: ParentNode, block: Block): HTMLElement {
  const el = root.querySelector<HTMLElement>(`.${blockClass(block)}`);
  if (!el) throw new Error(`no wrapper for ${block.type}`);
  return el;
}

const holder = (root: ParentNode, block: Block) => [...wrapper(root, block).parentElement!.classList];

const centred = (type: "heading" | "button"): Block => {
  const b = newBlock(type);
  return { ...b, props: { ...b.props, text: "Buy now" }, style: { ...b.style, blockAlign: "center" } };
};

describe("the canvas holds a block the way the page does", () => {
  it("puts it in a column flex container, in both", () => {
    for (const type of ["heading", "button"] as const) {
      const b = centred(type);
      canvas([b]);
      const inCanvas = holder(document, b);
      const inPage = holder(page([b]), b);
      for (const [where, classes] of [["canvas", inCanvas], ["page", inPage]] as const) {
        expect(classes, `${type}/${where}`).toContain("flex");
        expect(classes, `${type}/${where}`).toContain("flex-col");
      }
      act(() => mounted?.unmount());
      mounted = null;
    }
  });

  it("gives it the auto margins that do the moving", () => {
    // The canvas writes them as an attribute and the page as a rule — see
    // blockCssAt. Both have to say it, or the container above is moot.
    const b = centred("button");
    canvas([b]);
    expect(wrapper(document, b).style.marginLeft).toBe("auto");
    expect(wrapper(document, b).style.marginRight).toBe("auto");
    expect(page([b]).innerHTML).toContain("margin-left:auto");
  });

  it("leaves a left-aligned block stretched, as it always was", () => {
    // The fix must not start shrink-wrapping every block: a flex item is only
    // exempt from stretching when a cross-axis margin is auto.
    const b = newBlock("heading");
    const filled = { ...b, props: { ...b.props, text: "Hi" } };
    canvas([filled]);
    const el = wrapper(document, filled);
    expect(el.style.marginLeft).not.toBe("auto");
    expect(el.style.marginRight).not.toBe("auto");
  });
});

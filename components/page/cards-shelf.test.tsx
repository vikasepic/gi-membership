// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { normalizeBlocks, newBlock, type Block } from "@/lib/blocks";
import { controlsFor } from "@/lib/block-controls";

const theme = bandTheme("paper");
let root: { unmount: () => void } | null = null;
afterEach(() => { const r = root; root = null; if (r) act(() => r.unmount()); });

const card = (t: string) => ({ title: t, body: "Some body copy.", amount: "" });

function mount(props: Record<string, unknown>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host); root = r;
  const b = normalizeBlocks([{ id: "b1", type: "cards", props }]);
  act(() => { r.render(<Blocks blocks={b} theme={theme} />); });
  return host;
}

/**
 * A shelf that scrolls has to say it scrolls.
 *
 * The cards block could already be set side by side in a strip you swipe, but
 * unlike the quote slider it drew nothing to say so — on a desktop with no
 * touch and a hidden scrollbar, three cards that happen to fit look like three
 * cards and the rest are a secret. Same rail the slider uses, off until asked
 * for so every shelf already saved renders the markup it has.
 */
describe("the cards shelf", () => {
  const six = [card("a"), card("b"), card("c"), card("d"), card("e"), card("f")];

  it("draws arrows on a shelf that asks for them", () => {
    const host = mount({ items: six, carousel: true, columns: "3", arrows: true });
    expect(host.querySelector('[aria-label="Previous slides"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Next slides"]')).not.toBeNull();
  });

  it("draws none unless asked", () => {
    const host = mount({ items: six, carousel: true, columns: "3" });
    expect(host.querySelector('[aria-label="Previous slides"]')).toBeNull();
  });

  it("draws none on a grid, where there is nothing to scroll", () => {
    const host = mount({ items: six, columns: "3", arrows: true });
    expect(host.querySelector('[aria-label="Previous slides"]')).toBeNull();
  });

  it("still scrolls the strip itself", () => {
    const host = mount({ items: six, carousel: true, columns: "3", arrows: true });
    expect(host.querySelector(".snap-x")).not.toBeNull();
  });

  it("offers the setting only once the shelf is on", () => {
    const grid = newBlock("cards") as Block;
    const shelf = { ...grid, props: { ...grid.props, carousel: true } } as Block;
    const keyOf = (b: Block) =>
      controlsFor(b).content.filter((c) => (c as { key?: string }).key === "arrows").length;
    expect(keyOf(shelf)).toBe(1);
    expect(keyOf(grid)).toBe(0);
  });
});

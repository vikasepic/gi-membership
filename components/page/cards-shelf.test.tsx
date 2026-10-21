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

  /**
   * The arrows were drawn, labelled and disabled correctly and moved nothing.
   *
   * The rail asked for a `ul` to scroll, which is what the quote slider passes
   * it; a cards shelf passes a `div`. `scroller()` came back null, so `go()`
   * returned early on every press and `measure()` never ran — which is also
   * why Previous stayed disabled for good, at both ends of the rail.
   */
  it("scrolls the strip when an arrow is pressed", () => {
    const host = mount({ items: six, carousel: true, columns: "3", arrows: true });
    const strip = host.querySelector<HTMLElement>(".snap-x")!;
    Object.defineProperty(strip, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(strip, "scrollWidth", { value: 1200, configurable: true });
    const by: number[] = [];
    strip.scrollBy = ((o: ScrollToOptions) => { by.push(Number(o.left)); }) as typeof strip.scrollBy;
    // jsdom gives the strip no size, so the rail measured 0 at mount and had
    // already decided it was at the end. The stubs above are what a real strip
    // reports; one scroll event is what makes it look again.
    act(() => { strip.dispatchEvent(new Event("scroll")); });
    const next = host.querySelector<HTMLButtonElement>('[aria-label="Next slides"]')!;
    expect(next.disabled).toBe(false);
    act(() => { next.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(by).toEqual([300]);
  });

  /** And back the other way, so the rail is not one-directional. */
  it("scrolls back when Previous is pressed", () => {
    const host = mount({ items: six, carousel: true, columns: "3", arrows: true });
    const strip = host.querySelector<HTMLElement>(".snap-x")!;
    Object.defineProperty(strip, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(strip, "scrollWidth", { value: 1200, configurable: true });
    strip.scrollLeft = 300;
    const by: number[] = [];
    strip.scrollBy = ((o: ScrollToOptions) => { by.push(Number(o.left)); }) as typeof strip.scrollBy;
    act(() => { strip.dispatchEvent(new Event("scroll")); });
    const prev = host.querySelector<HTMLButtonElement>('[aria-label="Previous slides"]')!;
    expect(prev.disabled).toBe(false);
    act(() => { prev.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(by).toEqual([-300]);
  });

  /**
   * Dragging with a mouse. Touch is left alone on purpose — it already scrolls
   * this strip natively, with momentum and snapping no handler here would match.
   */
  it("drags the strip with a pointer", () => {
    const host = mount({ items: six, carousel: true, columns: "3", arrows: true });
    const strip = host.querySelector<HTMLElement>(".snap-x")!;
    Object.defineProperty(strip, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(strip, "scrollWidth", { value: 1200, configurable: true });
    strip.scrollLeft = 0;
    const at = (type: string, clientX: number, pointerType = "mouse") => {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
      Object.defineProperty(e, "pointerType", { value: pointerType });
      Object.defineProperty(e, "pointerId", { value: 1 });
      return e;
    };
    act(() => { strip.dispatchEvent(at("pointerdown", 200)); });
    act(() => { strip.dispatchEvent(at("pointermove", 140)); });
    expect(strip.scrollLeft).toBe(60);
    act(() => { strip.dispatchEvent(at("pointerup", 140)); });
    // Released, so a later move is not still dragging it.
    act(() => { strip.dispatchEvent(at("pointermove", 40)); });
    expect(strip.scrollLeft).toBe(60);
    // And it still looks like a handle for the next drag.
    expect(strip.style.cursor).toBe("grab");
  });

  /** A touch is the browser's to handle, not ours. */
  it("leaves touch scrolling to the browser", () => {
    const host = mount({ items: six, carousel: true, columns: "3", arrows: true });
    const strip = host.querySelector<HTMLElement>(".snap-x")!;
    strip.scrollLeft = 0;
    const touch = (type: string, clientX: number) => {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX });
      Object.defineProperty(e, "pointerType", { value: "touch" });
      Object.defineProperty(e, "pointerId", { value: 2 });
      return e;
    };
    act(() => { strip.dispatchEvent(touch("pointerdown", 200)); });
    act(() => { strip.dispatchEvent(touch("pointermove", 140)); });
    expect(strip.scrollLeft).toBe(0);
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

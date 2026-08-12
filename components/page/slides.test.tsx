// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { normalizeBlocks, newBlock } from "@/lib/blocks";
import { controlsFor } from "@/lib/block-controls";

const theme = bandTheme("paper");
let root: { unmount: () => void } | null = null;
afterEach(() => { const r = root; root = null; if (r) act(() => r.unmount()); });

const slide = (q: string) => ({ quote: q, name: "A name", role: "A role", image: "" });

function mount(props: Record<string, unknown>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host); root = r;
  const b = normalizeBlocks([{ id: "b1", type: "slides", props }]);
  act(() => { r.render(<Blocks blocks={b} theme={theme} />); });
  return host;
}

/**
 * A strip that scrolls has to say it scrolls.
 *
 * `arrows` and `dots` were props from the day the block was written, with no
 * controls and nothing reading them — so on a desktop with no touch and a
 * hidden scrollbar, three slides that happen to fit looked like three cards and
 * the fourth was a secret.
 */
describe("the slide rail", () => {
  it("draws arrows and dots when there is more than one page", () => {
    const host = mount({ items: [slide("a"), slide("b"), slide("c"), slide("d")], perView: 2 });
    expect(host.querySelector('[aria-label="Next slides"]')).not.toBeNull();
    expect(host.querySelectorAll('[aria-label^="Go to slide"]').length).toBe(2);
  });

  it("draws neither when everything already fits", () => {
    // Arrows that cannot move and one dot that means nothing are worse than
    // drawing neither.
    const host = mount({ items: [slide("a"), slide("b")], perView: 2 });
    expect(host.querySelector('[aria-label="Next slides"]')).toBeNull();
    expect(host.querySelector('[aria-label^="Go to slide"]')).toBeNull();
  });

  it("counts pages, not slides", () => {
    // Six slides three at a time is two dots, not six.
    const host = mount({ items: Array.from({ length: 6 }, (_, i) => slide(String(i))), perView: 3 });
    expect(host.querySelectorAll('[aria-label^="Go to slide"]').length).toBe(2);
  });

  it("can have both switched off", () => {
    const host = mount({ items: [slide("a"), slide("b"), slide("c")], perView: 1, arrows: false, dots: false });
    expect(host.querySelector('[aria-label="Next slides"]')).toBeNull();
    expect(host.querySelector('[aria-label^="Go to slide"]')).toBeNull();
    // The strip is still there and still scrolls; only the controls are gone.
    expect(host.querySelector("ul")).not.toBeNull();
  });

  it("still renders the list itself, so it works with no JavaScript", () => {
    const host = mount({ items: [slide("a"), slide("b"), slide("c"), slide("d")], perView: 2 });
    expect(host.querySelectorAll("li").length).toBe(4);
    expect(host.querySelector("ul")!.className).toContain("overflow-x-auto");
  });

  it("draws the affordances on the portrait skin too", () => {
    const host = mount({
      items: [slide("a"), slide("b"), slide("c")], perView: 1, skin: "portrait",
    });
    expect(host.querySelector('[aria-label="Next slides"]')).not.toBeNull();
  });

  it("offers more than three at once, and per device", () => {
    const c = controlsFor(newBlock("slides")).content.find((x) => "key" in x && x.key === "perView");
    expect(c && "max" in c ? c.max : 0).toBeGreaterThan(3);
    expect(c && "responsive" in c ? c.responsive : false).toBe(true);
  });

  it("offers the two controls that never existed", () => {
    const keys = controlsFor(newBlock("slides")).content.flatMap((c) => ("key" in c ? [c.key] : []));
    expect(keys).toContain("arrows");
    expect(keys).toContain("dots");
  });
});

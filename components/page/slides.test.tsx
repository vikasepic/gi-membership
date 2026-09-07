// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { normalizeBlocks, newBlock } from "@/lib/blocks";
import { controlsFor } from "@/lib/block-controls";
import { listTemplates } from "@/lib/templates";

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

/**
 * The picture as a face beside the name, rather than as the ground behind it.
 *
 * Portrait lays the quote over a full-bleed photograph. A text-only design
 * wants the same strip and the same words with the picture reduced to a small
 * circle, which is the one part of that shape the panelled skins did not draw
 * at all — they read `quote`, `name` and `role` and ignored `image`.
 */
describe("the avatar on a panelled slide", () => {
  const withPhoto = { quote: "Words", name: "A name", role: "A role", image: "/templates/sections/portrait-1.svg" };

  it("draws a round picture beside the name once it is asked for", () => {
    const host = mount({ items: [withPhoto, withPhoto], avatars: true });
    const img = host.querySelector("li img");
    expect(img).not.toBeNull();
    expect(img!.className).toContain("rounded-full");
    // The name and the role stand beside it, on their own lines rather than
    // run together with a middot.
    expect(host.querySelector("li")!.textContent).not.toContain("·");
  });

  it("draws none at all until it is, so no slider already saved changes", () => {
    // The photograph is kept on the slide when the style is switched away from
    // Portrait, so rows with an image and a panelled skin already exist. They
    // draw exactly what they drew before.
    const host = mount({ items: [withPhoto, withPhoto] });
    expect(host.querySelector("li img")).toBeNull();
    expect(host.querySelector("li")!.textContent).toContain("A name · A role");
  });

  it("falls back to the plain line for a slide with no picture", () => {
    const host = mount({ items: [{ ...withPhoto, image: "" }, withPhoto], avatars: true });
    expect(host.querySelectorAll("li img").length).toBe(1);
    expect(host.querySelectorAll("li")[0].textContent).toContain("A name · A role");
  });

  it("is offered as a control, or nobody can reach it", () => {
    const keys = controlsFor(newBlock("slides")).content.flatMap((c) => ("key" in c ? [c.key] : []));
    expect(keys).toContain("avatars");
  });
});

/**
 * The design the avatar was added for: one testimonial at a time, no
 * photograph behind it, on the shelf as its own entry.
 */
describe("the text-only testimonial design", () => {
  const t = listTemplates().find((x) => x.id === "testimonial-quotes");

  it("is on the shelf under Testimonials", () => {
    expect(t?.group).toBe("Testimonials");
  });

  it("draws the words, a round face and the two affordances, and no backdrop", () => {
    const host = mount(t!.blocks[0].props);
    expect(host.querySelector('[aria-label="Next slides"]')).not.toBeNull();
    expect(host.querySelector('[aria-label^="Go to slide"]')).not.toBeNull();
    expect(host.querySelector("li img")!.className).toContain("rounded-full");
    // Portrait's tell: a 3/4 box with the picture stretched behind the quote.
    expect(host.querySelector("li")!.getAttribute("style") ?? "").not.toContain("aspect-ratio");
  });
});

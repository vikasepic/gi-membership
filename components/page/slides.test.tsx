// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { normalizeBlocks, newBlock, type Block } from "@/lib/blocks";
import { renderToStaticMarkup } from "react-dom/server";
import { controlsFor } from "@/lib/block-controls";
import { listTemplates } from "@/lib/templates";
import { readFileSync } from "node:fs";

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

/**
 * The arrows had one shape and no controls.
 *
 * A filled circle in the accent with a chevron inside it, and no way to say
 * otherwise — the reference design is a bare chevron over the card's edge, and
 * getting it meant editing this file. So the shape, its colour, its size and a
 * custom picture per direction are settings now.
 *
 * `arrowStyle: "solid"` is the default and `arrowSize` is null, which is what
 * "nothing already saved moves" looks like: the button below is byte for byte
 * the one the renderer drew before any of these existed.
 */
describe("the shape of the arrows", () => {
  const three = { items: [slide("a"), slide("b"), slide("c")], perView: 1 };
  const button = (props: Record<string, unknown>, side = "Previous") =>
    mount({ ...three, ...props }).querySelector(`[aria-label="${side} slides"]`)!;

  it("draws the filled circle it always drew when nothing is set", () => {
    // Captured from the renderer at the commit before these controls existed.
    // Not a snapshot on purpose: a snapshot updated with a flag is no defence
    // against the thing this guards, which is a default that repaints every
    // slider on every live page.
    expect(button({}).outerHTML).toBe(
      '<button type="button" disabled="" aria-label="Previous slides" class="absolute top-1/2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full shadow-md transition-opacity disabled:opacity-0 -left-2 md:-left-4" style="background: rgb(176, 83, 47); color: rgb(255, 255, 255);"><svg viewBox="0 0 24 24" aria-hidden="true" class="size-4 fill-current"><path d="M15.4 4.6 7 13l8.4 8.4 1.4-1.4L9.8 13l7-7-1.4-1.4Z"></path></svg></button>',
    );
  });

  it("drops the circle, the shadow and the fill for the bare chevron", () => {
    const b = button({ arrowStyle: "bare" });
    expect(b.className).not.toContain("rounded-full");
    expect(b.className).not.toContain("shadow-md");
    expect(b.getAttribute("style")).not.toContain("background");
    // Painted in the band's accent, which is what the circle was filled with.
    expect(b.getAttribute("style")).toContain("rgb(176, 83, 47)");
  });

  it("draws the outline as a hairline with nothing inside it", () => {
    const b = button({ arrowStyle: "outline" });
    expect(b.className).toContain("rounded-full");
    expect(b.getAttribute("style")).toContain("border");
    expect(b.getAttribute("style")).not.toContain("background");
  });

  it("takes a colour of its own", () => {
    expect(button({ arrowColor: "#ff0000" }).getAttribute("style")).toContain("rgb(255, 0, 0)");
  });

  it("takes a size, and the box is what moves", () => {
    const b = button({ arrowSize: 60 });
    expect(b.className).not.toContain("size-9");
    expect(b.getAttribute("style")).toContain("width: 60px");
    expect(b.getAttribute("style")).toContain("height: 60px");
  });

  it("swaps an uploaded picture in for one side and leaves the other drawn", () => {
    const host = mount({ ...three, arrowPrevImage: "/templates/sections/portrait-1.svg" });
    const prev = host.querySelector('[aria-label="Previous slides"]')!;
    const next = host.querySelector('[aria-label="Next slides"]')!;
    const img = prev.querySelector("img");
    expect(img).not.toBeNull();
    // Decoration beside a button that already carries the label.
    expect(img!.getAttribute("alt")).toBe("");
    expect(prev.querySelector("svg")).toBeNull();
    expect(next.querySelector("svg")).not.toBeNull();
    expect(next.querySelector("img")).toBeNull();
  });

  it("keeps the label, the position and the disabling whatever the shape is", () => {
    const b = button({ arrowStyle: "bare", arrowSize: 60, arrowNextImage: "/x.svg" });
    expect(b.getAttribute("aria-label")).toBe("Previous slides");
    expect(b.className).toContain("-left-2");
    expect(b.className).toContain("disabled:opacity-0");
    expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers every one of them as a control", () => {
    const keys = controlsFor(newBlock("slides")).content.flatMap((c) => ("key" in c ? [c.key] : []));
    expect(keys).toContain("arrowStyle");
    expect(keys).toContain("arrowColor");
    expect(keys).toContain("arrowSize");
    expect(keys).toContain("arrowPrevImage");
    expect(keys).toContain("arrowNextImage");
  });

  it("ships the words-only template on the bare chevron, which is the reference", () => {
    const t = listTemplates().find((x) => x.id === "testimonial-quotes");
    expect(t!.blocks[0].props.arrowStyle).toBe("bare");
  });
});

/**
 * The strip scrolls. The bar under it does not have to be drawn.
 *
 * `overflow-x-auto` paints a horizontal scrollbar on any desktop that draws
 * them, sitting under the card — which contradicts the design the rest of the
 * rail was built around: the arrows and the dots exist precisely because "on a
 * desktop with no touch and a hidden scrollbar" a strip has no way of saying it
 * scrolls.
 *
 * Only the painted bar goes. `overflow-x-auto` stays, so the element is still a
 * scroll container: touch swipe, trackpad and keyboard all go through it, and
 * `overflow: hidden` — which would take all three away — is never reached for.
 */
describe("the scrollbar under the slides", () => {
  const strip = (props: Record<string, unknown>) =>
    mount({ items: [slide("a"), slide("b"), slide("c")], ...props }).querySelector("ul")!;
  const css = readFileSync("app/globals.css", "utf8");

  it("hides the bar's chrome on both skins", () => {
    expect(strip({}).className).toContain("no-scrollbar");
    expect(strip({ skin: "portrait" }).className).toContain("no-scrollbar");
  });

  it("hides it in a stylesheet rule, not inline, because two skins need it", () => {
    expect(css).toContain(".no-scrollbar");
    // Firefox takes the property; everything else takes the pseudo-element.
    expect(css).toMatch(/\.no-scrollbar\s*\{[^}]*scrollbar-width:\s*none/);
    expect(css).toMatch(/\.no-scrollbar::-webkit-scrollbar\s*\{[^}]*display:\s*none/);
  });

  it("leaves the strip scrollable by touch, trackpad and keyboard", () => {
    // All three are the same mechanism: the element is a scroll container
    // because of `overflow-x-auto`, and hiding a bar's chrome does not stop it
    // being one. `overflow: hidden` here would take all three away at once.
    expect(strip({}).className).toContain("overflow-x-auto");
    expect(strip({ skin: "portrait" }).className).toContain("overflow-x-auto");
    const rule = css.slice(css.indexOf(".no-scrollbar"));
    expect(rule.slice(0, rule.indexOf("}"))).not.toContain("overflow");
  });
});

/**
 * The person's name and their role, and how either one looks.
 *
 * They were hardcoded in three separate places — the portrait skin, the
 * panelled skins with an avatar, and the panelled skins without one, where the
 * two run together on one muted line. Somebody who wanted the name bigger had
 * no control at all, on any of them.
 *
 * Six props, following exactly how `cardPadding` and its neighbours are
 * declared on the cards block: null size, empty weight, null colour, and every
 * one of them meaning "whatever the skin already drew". The goldens below were
 * captured from the renderer BEFORE any of them existed, so a byte of drift
 * fails here.
 */
describe("a slides block saved before the name and role had settings", () => {
  const stored = (props: Record<string, unknown>): Block =>
    normalizeBlocks([{ id: "b1", type: "slides", props }])[0];
  // A sibling after the fixture, whose markup is cut back off: the last block
  // in a flow has its bottom margin zeroed, so a one-block fixture would have
  // to be re-baselined to keep passing — the one thing a golden must never be
  // asked to do.
  const TAIL_ID = "tail-sentinel";
  const render = (b: Block) => {
    const tail = normalizeBlocks([{ id: TAIL_ID, type: "spacer", props: { height: 8 } }]);
    const out = renderToStaticMarkup(<Blocks blocks={[b, ...tail]} theme={theme} />);
    const cut = out.indexOf(`<style>.bk-${TAIL_ID}`);
    if (cut === -1) throw new Error("the sentinel did not render — the cut below is measuring nothing");
    return `${out.slice(0, cut)}</div>`;
  };
  const ITEMS = [
    { quote: "One", name: "A name", role: "A role", image: "/p1.svg" },
    { quote: "Two", name: "B name", role: "", image: "" },
  ];

  it("renders the panelled slide byte for byte as it did", () => {
    expect(render(stored({ items: ITEMS }))).toBe(
      "<div class=\"mt-7 flex flex-col\"><style>.bk-b1.bk-b1{margin:0px 0px 16px 0px;padding:0px 0px 0px 0px;text-align:left;color:#16181f}</style><div class=\"bk-b1\"><div class=\"relative\"><div><ul class=\"no-scrollbar -mx-1 flex list-none snap-x snap-mandatory gap-4 overflow-x-auto p-0 px-1 pb-2\"><li class=\"min-w-0 shrink-0 snap-start rounded-2xl px-5 py-4\" style=\"flex-basis:calc(100% - 0px);background:#f4f2ec;color:#16181f\"><p class=\"m-0\"><span style=\"white-space:pre-line\">\u201cOne\u201d</span></p><span class=\"mt-2 block text-[0.8rem] opacity-70\">A name \u00b7 A role</span></li><li class=\"min-w-0 shrink-0 snap-start rounded-2xl px-5 py-4\" style=\"flex-basis:calc(100% - 0px);background:#f4f2ec;color:#16181f\"><p class=\"m-0\"><span style=\"white-space:pre-line\">\u201cTwo\u201d</span></p><span class=\"mt-2 block text-[0.8rem] opacity-70\">B name</span></li></ul></div></div></div></div>",
    );
  });

  it("renders the slide with an avatar byte for byte as it did", () => {
    expect(render(stored({ items: ITEMS, avatars: true }))).toBe(
      "<link rel=\"preload\" as=\"image\" href=\"/p1.svg\"/><div class=\"mt-7 flex flex-col\"><style>.bk-b1.bk-b1{margin:0px 0px 16px 0px;padding:0px 0px 0px 0px;text-align:left;color:#16181f}</style><div class=\"bk-b1\"><div class=\"relative\"><div><ul class=\"no-scrollbar -mx-1 flex list-none snap-x snap-mandatory gap-4 overflow-x-auto p-0 px-1 pb-2\"><li class=\"min-w-0 shrink-0 snap-start rounded-2xl px-5 py-4\" style=\"flex-basis:calc(100% - 0px);background:#f4f2ec;color:#16181f\"><p class=\"m-0\"><span style=\"white-space:pre-line\">\u201cOne\u201d</span></p><span class=\"mt-4 flex items-center gap-3\"><img src=\"/p1.svg\" alt=\"\" class=\"h-10 w-10 shrink-0 rounded-full object-cover\"/><span class=\"min-w-0\"><span class=\"block text-[0.85rem] font-semibold\">A name</span><span class=\"block text-[0.8rem] opacity-70\">A role</span></span></span></li><li class=\"min-w-0 shrink-0 snap-start rounded-2xl px-5 py-4\" style=\"flex-basis:calc(100% - 0px);background:#f4f2ec;color:#16181f\"><p class=\"m-0\"><span style=\"white-space:pre-line\">\u201cTwo\u201d</span></p><span class=\"mt-2 block text-[0.8rem] opacity-70\">B name</span></li></ul></div></div></div></div>",
    );
  });

  it("renders the portrait slide byte for byte as it did", () => {
    expect(render(stored({ items: ITEMS, skin: "portrait" }))).toBe(
      "<link rel=\"preload\" as=\"image\" href=\"/p1.svg\"/><div class=\"mt-7 flex flex-col\"><style>.bk-b1.bk-b1{margin:0px 0px 16px 0px;padding:0px 0px 0px 0px;text-align:left;color:#16181f}</style><div class=\"bk-b1\"><div class=\"relative\"><div><ul class=\"no-scrollbar -mx-1 flex list-none snap-x snap-mandatory gap-4 overflow-x-auto p-0 px-1 pb-2\"><li class=\"relative flex min-w-0 shrink-0 snap-start flex-col justify-end overflow-hidden\" style=\"flex-basis:calc(100% - 0px);aspect-ratio:3 / 4;border-radius:16px;background:#f4f2ec\"><img src=\"/p1.svg\" alt=\"\" class=\"absolute inset-0 h-full w-full object-cover\"/><div aria-hidden=\"true\" class=\"absolute inset-0\" style=\"background:linear-gradient(to top, #f4f2ec 0%, #f4f2ecf2 42%, #f4f2ec00 100%)\"></div><div class=\"relative p-5\"><span aria-hidden=\"true\" class=\"block font-display text-[2.6rem] leading-[0.6] opacity-60\" style=\"color:#000000\">\u201c</span><p class=\"mt-3 mb-0 text-[0.95rem] leading-snug\" style=\"color:#000000;white-space:pre-line\">One</p><div class=\"mt-4 pt-3\" style=\"border-top:1px solid #00000059\"><span class=\"block text-[0.86rem] font-semibold uppercase tracking-[0.06em]\" style=\"color:#000000\">A name</span><span class=\"block text-[0.82rem] opacity-80\" style=\"color:#000000\">A role</span></div></div></li><li class=\"relative flex min-w-0 shrink-0 snap-start flex-col justify-end overflow-hidden\" style=\"flex-basis:calc(100% - 0px);aspect-ratio:3 / 4;border-radius:16px;background:#f4f2ec\"><div aria-hidden=\"true\" class=\"absolute inset-0\" style=\"background:linear-gradient(to top, #f4f2ec 0%, #f4f2ecf2 42%, #f4f2ec00 100%)\"></div><div class=\"relative p-5\"><span aria-hidden=\"true\" class=\"block font-display text-[2.6rem] leading-[0.6] opacity-60\" style=\"color:#000000\">\u201c</span><p class=\"mt-3 mb-0 text-[0.95rem] leading-snug\" style=\"color:#000000;white-space:pre-line\">Two</p><div class=\"mt-4 pt-3\" style=\"border-top:1px solid #00000059\"><span class=\"block text-[0.86rem] font-semibold uppercase tracking-[0.06em]\" style=\"color:#000000\">B name</span></div></div></li></ul></div></div></div></div>",
    );
  });
});

/**
 * And what those six settings actually do, on all three of the places the pair
 * is drawn. Not routed through BlockStyle: that is one style for the whole
 * block, and this is two parts inside one.
 */
describe("the name and the role, once somebody sets them", () => {
  const set = {
    nameSize: 22,
    nameWeight: "800",
    nameColor: "#ff0000",
    roleSize: 11,
    roleWeight: "300",
    roleColor: "#0000ff",
  };
  const html = (props: Record<string, unknown>) =>
    mount({ items: [slide("a"), slide("b")], ...props }).querySelector("ul")!.innerHTML;

  it("sizes, weights and colours them on the panelled skin", () => {
    const out = html(set);
    expect(out).toContain("font-size: 22px");
    expect(out).toContain("font-weight: 800");
    expect(out).toContain("rgb(255, 0, 0)");
    expect(out).toContain("font-size: 11px");
    expect(out).toContain("font-weight: 300");
    expect(out).toContain("rgb(0, 0, 255)");
  });

  it("does the same beside an avatar", () => {
    const out = html({ ...set, avatars: true, items: [{ ...slide("a"), image: "/p1.svg" }, slide("b")] });
    expect(out).toContain("font-size: 22px");
    expect(out).toContain("rgb(0, 0, 255)");
  });

  it("does the same on the portrait skin, over the photograph", () => {
    const out = html({ ...set, skin: "portrait" });
    expect(out).toContain("font-size: 22px");
    expect(out).toContain("rgb(255, 0, 0)");
    expect(out).toContain("rgb(0, 0, 255)");
  });

  it("lets go of the muting once a colour is chosen, or the colour is a lie", () => {
    // The role is drawn at 70% opacity, so a colour set through it would come
    // out as something else entirely — the control would look broken.
    expect(html({ roleColor: "#0000ff", avatars: true, items: [{ ...slide("a"), image: "/p1.svg" }] }))
      .not.toContain("opacity-70");
    expect(html({})).toContain("opacity-70");
  });

  it("offers all six as controls", () => {
    const keys = controlsFor(newBlock("slides")).content.flatMap((c) => ("key" in c ? [c.key] : []));
    for (const k of ["nameSize", "nameWeight", "nameColor", "roleSize", "roleWeight", "roleColor"]) {
      expect(keys).toContain(k);
    }
  });
});

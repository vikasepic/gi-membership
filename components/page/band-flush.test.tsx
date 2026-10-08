// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionBand } from "@/components/page/sales-page";
import { defaultRows, normalizeSectionLayout, SECTIONS } from "@/lib/page-sections";

// A band whose modules paint their own ground edge to edge asks to be flush:
// the 28px the block stack sits below would show as a strip of the band's
// colour above the first module's. Asked, never inferred — live pages built
// full width with no top air before this existed keep the gap they have.
describe("a flush band", () => {
  const hero = { ...defaultRows(SECTIONS)[0], content: { blocks: [{ type: "heading", props: { text: "x" } }] } };
  const money = { priceLabel: null, termsLabel: null };
  const stack = (html: string) => html.match(/<div class="([^"]*flex flex-col)">/)?.[1];

  it("starts its blocks at the band's top edge", () => {
    const layout = { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, flush: true };
    const html = renderToStaticMarkup(<SectionBand row={{ ...hero, layout }} money={money} />);
    expect(stack(html)).toBe("flex flex-col");
  });

  it("keeps the gap on a full band with no top air that did not ask", () => {
    const layout = { width: "full", pad: { t: 0, r: 0, b: 0, l: 0 } };
    const html = renderToStaticMarkup(<SectionBand row={{ ...hero, layout }} money={money} />);
    expect(stack(html)).toBe("mt-7 flex flex-col");
  });

  it("survives the trip through the layout reader, and is absent until set", () => {
    expect(normalizeSectionLayout({ width: "full", flush: true }).flush).toBe(true);
    expect("flush" in normalizeSectionLayout({ width: "full" })).toBe(false);
    expect("flush" in normalizeSectionLayout({ width: "full", flush: "yes" })).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionBand } from "@/components/page/sales-page";
import { defaultRows, SECTIONS } from "@/lib/page-sections";
import { emptyBackground } from "@/lib/blocks";

const money = { priceLabel: null, termsLabel: null };
const hero = {
  ...defaultRows(SECTIONS)[0],
  content: { blocks: [{ type: "heading", props: { text: "x" } }] },
  background: { ...emptyBackground(), type: "classic" as const, image: "https://x.test/wide.jpg" },
  layout: {
    pad: { t: 80, r: null, b: 80, l: null },
    padUnit: "px",
    responsive: { mobile: { pad: { t: 24, r: null, b: 24, l: null }, background: { type: "classic", color: "#11325b", image: "" } } },
  },
};

describe("a band with a phone of its own", () => {
  it("live: desktop inline, the phone as an important media rule on its id", () => {
    const html = renderToStaticMarkup(<SectionBand row={hero} money={money} />);
    expect(html).toContain("padding-top:80px");
    expect(html).toContain("wide.jpg");
    expect(html).toContain("@media (max-width:767px){#section-hero{");
    expect(html).toContain("padding-top:24px !important");
    expect(html).toContain("background-color:#11325b !important");
  });
  it("on the phone canvas: the phone's look inline, no media rules", () => {
    const html = renderToStaticMarkup(<SectionBand row={hero} money={money} at="mobile" />);
    expect(html).toContain("padding-top:24px");
    expect(html).not.toContain("wide.jpg");
    expect(html).toContain("#11325b");
    expect(html).not.toContain("@media");
  });
  it("a band with no overrides emits no rules at all", () => {
    const plain = { ...hero, layout: { pad: { t: 80, r: null, b: 80, l: null }, padUnit: "px" } };
    // Blocks emit a <style> of their own; the band's is the one with a media query.
    expect(renderToStaticMarkup(<SectionBand row={plain} money={money} />)).not.toContain("@media (max-width");
  });
});

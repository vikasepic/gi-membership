// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionBand } from "@/components/page/sales-page";
import { defaultRows, SECTIONS } from "@/lib/page-sections";

describe("a band's anchor", () => {
  const hero = { ...defaultRows(SECTIONS)[0], content: { blocks: [{ type: "heading", props: { text: "x" } }] } };
  const money = { priceLabel: null, termsLabel: null };

  it("falls back to the section key, so a preview can jump to it", () => {
    const html = renderToStaticMarkup(<SectionBand row={hero} money={money} />);
    expect(html).toContain('id="section-hero"');
  });

  it("keeps a CSS id the page set itself", () => {
    const html = renderToStaticMarkup(<SectionBand row={{ ...hero, cssId: "top" }} money={money} />);
    expect(html).toContain('id="top"');
    expect(html).not.toContain("section-hero");
  });
});

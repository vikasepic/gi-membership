import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SaleTags } from "@/components/page/sale-tags";

describe("SaleTags", () => {
  it("writes property= tags, which is what the scrapers read", () => {
    const out = renderToStaticMarkup(<SaleTags priceCents={4700} currency="usd" />);
    expect(out).toContain('<meta property="og:type" content="product"/>');
    expect(out).toContain('<meta property="product:price:amount" content="47.00"/>');
    expect(out).toContain('<meta property="product:price:currency" content="USD"/>');
    expect(out).not.toContain('name="og:type"');
  });
});

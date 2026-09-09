import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { CatalogueThumb } from "@/components/admin/catalogue-thumb";

// You recognise a product by its artwork long before you have read its title.
// A column of titles alone makes you read every one.

describe("the cover beside the name", () => {
  it("shows the picture when there is one", () => {
    const out = renderToStaticMarkup(<CatalogueThumb coverPath="products/1/a.webp" />);
    expect(out).toContain("<img");
    expect(out).toContain("products/1/a.webp");
  });

  it("holds the space when there is not", () => {
    // A row that loses its first column when a product has no cover is a row
    // whose names stop lining up.
    const out = renderToStaticMarkup(<CatalogueThumb coverPath={null} />);
    expect(out).not.toContain("<img");
    expect(out).toContain("size-9");
  });

  it("is square, and the same size either way", () => {
    // At this size the shape carries no information, and squares line up.
    const withImage = renderToStaticMarkup(<CatalogueThumb coverPath="a.webp" />);
    const without = renderToStaticMarkup(<CatalogueThumb coverPath={null} />);
    expect(withImage).toContain("size-9");
    expect(without).toContain("size-9");
  });

  it("is decorative by default", () => {
    // The title is right beside it; a screen reader should not read it twice.
    expect(renderToStaticMarkup(<CatalogueThumb coverPath="a.webp" />)).toContain('alt=""');
  });
});

describe("the products page", () => {
  const src = readFileSync("app/admin/page.tsx", "utf8");

  it("shows the cover and the slug", () => {
    expect(src).toContain("CatalogueThumb");
    expect(src).toContain("/p/{p.slug}");
  });

  it("says whether the funnel is wired up", () => {
    expect(src).toContain("wiringOf(p");
    expect(src).toContain("Funnel");
  });

  it("uses the same cover the storefront does", () => {
    // Own image first, then the attached course's — otherwise the admin shows
    // one picture and the shop shows another.
    expect(src).toContain("p.coverPath ?? display.get(p.id)?.coverPath");
  });
});

describe("the offers page", () => {
  const src = readFileSync("app/admin/offers/page.tsx", "utf8");

  it("says where each offer is attached", () => {
    // Both kinds of host. Passing products alone is what made an offer sitting
    // in another offer's bump slot read as attached to nothing.
    expect(src).toContain("usesOf(o, products, offers)");
    expect(src).toContain("Used by");
  });

  it("calls out an offer attached to nothing", () => {
    expect(src).toContain("Not attached to anything");
  });

  it("states the terms in words", () => {
    expect(src).toContain("termsOf(o)");
  });
});

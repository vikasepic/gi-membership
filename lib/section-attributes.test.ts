import { describe, it, expect } from "vitest";
import { cssIdent, cssClasses } from "@/lib/pages";
import { readFileSync } from "node:fs";

// A section had no name. The one thing on a sales page you most want to link to
// — "#pricing" in a button, in an email, in an ad — was the one thing with no
// way to be pointed at.

describe("cleaning a CSS id", () => {
  it("keeps what is already valid", () => {
    expect(cssIdent("pricing")).toBe("pricing");
    expect(cssIdent("the-offer_2")).toBe("the-offer_2");
  });

  it("trims", () => {
    expect(cssIdent("  pricing  ")).toBe("pricing");
  });

  it("drops anything that would end the attribute", () => {
    // This lands in an id attribute AND in a selector. The only safe answer to
    // a quote or a bracket is that there isn't one.
    expect(cssIdent('a" onload="alert(1)')).toBe("aonloadalert1");
    expect(cssIdent("a b")).toBe("ab");
    expect(cssIdent("nav>li")).toBe("navli");
  });

  it("fixes an id a selector could not target", () => {
    // #2col is invalid CSS. Prefixing beats silently storing something that
    // never matches.
    expect(cssIdent("2col")).toBe("s-2col");
    expect(cssIdent("-x")).toBe("s--x");
  });

  it("is nothing when there is nothing left", () => {
    expect(cssIdent("")).toBeNull();
    expect(cssIdent("   ")).toBeNull();
    expect(cssIdent("!!!")).toBeNull();
    expect(cssIdent(null)).toBeNull();
  });
});

describe("cleaning a class list", () => {
  it("keeps several names", () => {
    expect(cssClasses("promo highlight")).toBe("promo highlight");
  });

  it("collapses whatever whitespace was typed", () => {
    expect(cssClasses("  promo   highlight \n dark ")).toBe("promo highlight dark");
  });

  it("cleans each name on its own", () => {
    expect(cssClasses('promo" x')).toBe("promo x");
  });

  it("is nothing when nothing survives", () => {
    expect(cssClasses("  ")).toBeNull();
    expect(cssClasses("!!! ???")).toBeNull();
  });
});

describe("where they end up", () => {
  it("on the band itself", () => {
    const src = readFileSync("components/page/sales-page.tsx", "utf8");
    expect(src).toContain("id={cssId || undefined}");
    expect(src).toContain("${cssClass ?? \"\"}");
  });

  it("cleaned on the way in, not on the way out", () => {
    // Stored clean, so every reader gets a safe value without repeating the
    // rule — and a page rendered from the database cannot be the exception.
    const src = readFileSync("lib/pages.ts", "utf8");
    expect(src).toContain("css_id: cssIdent(input.cssId)");
    expect(src).toContain("css_class: cssClasses(input.cssClass)");
  });
});

describe("the background can be positioned", () => {
  it("offers top, centre and bottom", () => {
    const src = readFileSync("components/admin/section-settings.tsx", "utf8");
    expect(src).toContain('["top", "Top"]');
    expect(src).toContain('["bottom", "Bottom"]');
    expect(src).toContain("setBg({ position: v })");
  });
});

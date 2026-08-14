import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { pageMetadata } from "@/lib/page-metadata";
import { SETTINGS_DEFAULTS } from "@/lib/settings-schema";

const store = { ...SETTINGS_DEFAULTS, name: "Greater Inside", metaDescription: "The store line." };
const empty = { metaTitle: "", metaDescription: "", shareImagePath: "" };

describe("a sales page introduces itself", () => {
  it("uses what somebody typed for this page", () => {
    const m = pageMetadata({
      page: { metaTitle: "Build the funnel", metaDescription: "In one sitting.", shareImagePath: "" },
      fallback: { title: "Funnel App", description: "A tagline" },
      store,
    });
    expect(m.title).toBe("Build the funnel");
    expect(m.description).toBe("In one sitting.");
    expect(m.openGraph?.title).toBe("Build the funnel");
  });

  it("falls back to what the page already is", () => {
    const m = pageMetadata({ page: empty, fallback: { title: "Funnel App", description: "A tagline" }, store });
    expect(m.title).toBe("Funnel App");
    expect(m.description).toBe("A tagline");
  });

  it("falls back to the store beneath that", () => {
    // The step that stops a page previewing as a bare link because a product
    // was created without a tagline.
    const m = pageMetadata({ page: empty, fallback: { title: "Funnel App" }, store });
    expect(m.description).toBe("The store line.");
  });

  it("never lets whitespace count as an answer", () => {
    const m = pageMetadata({
      page: { metaTitle: "   ", metaDescription: "\n ", shareImagePath: "" },
      fallback: { title: "Funnel App", description: "A tagline" },
      store,
    });
    expect(m.title).toBe("Funnel App");
    expect(m.description).toBe("A tagline");
  });

  it("shrinks the card rather than showing a large empty one", () => {
    // A large Twitter card with no image renders as a bare link, which is
    // worse than the small card.
    const none = pageMetadata({ page: empty, fallback: { title: "X" }, store: { ...store, shareImagePath: "" } });
    expect(none.twitter).toMatchObject({ card: "summary" });
  });
});

describe("the routes actually ask for it", () => {
  // The fields, the table and the panel are all worth nothing if the page does
  // not export generateMetadata — and nothing in the type system says it must.
  // This is the whole bug this feature exists to fix.
  it("is exported by the product sales page", () => {
    const src = readFileSync("app/(store)/p/[slug]/page.tsx", "utf8");
    expect(src).toContain("export async function generateMetadata");
    expect(src).toContain("pageMetadata(");
  });

  it("is exported by the offer sales page", () => {
    const src = readFileSync("app/(store)/o/[key]/page.tsx", "utf8");
    expect(src).toContain("export async function generateMetadata");
    expect(src).toContain("pageMetadata(");
  });

  it("cannot take a page down when the settings read fails", () => {
    // Metadata is decoration. A page that sells something must render without
    // its share card rather than 500 with one.
    for (const f of ["app/(store)/p/[slug]/page.tsx", "app/(store)/o/[key]/page.tsx"]) {
      const src = readFileSync(f, "utf8");
      const fn = src.slice(src.indexOf("export async function generateMetadata"));
      expect(fn.slice(0, fn.indexOf("export default")), f).toContain("catch");
    }
  });
});

describe("saving one panel does not blank the other", () => {
  it("merges rather than replacing the row", () => {
    // page_settings is now written by two forms — SEO and custom code — and a
    // full upsert from either blanks what the other owns. Learnt the hard way
    // on the store-wide settings, which is why this is pinned here.
    const src = readFileSync("app/admin/pages/actions.ts", "utf8");
    const fn = src.slice(src.indexOf("export async function savePageSettingsAction"));
    expect(fn).toContain("getPageSettings(owner, ownerId)");
    expect(fn).toContain("formData.has(");
  });
});

describe("a deploy that lands before the migration", () => {
  // 0052 adds the three SEO columns, and there is no way to guarantee a
  // database has run it before the code that reads them arrives. PostgREST
  // fails the WHOLE select on one unknown column, so asking for all six at
  // once would mean a database one migration behind losing every page's custom
  // CSS and JavaScript — a silent regression on live sales pages.
  const src = readFileSync("lib/pages.ts", "utf8");

  it("reads the old columns on their own when the new ones are missing", () => {
    const fn = src.slice(src.indexOf("export async function getPageSettings"));
    expect(fn).toContain('read("custom_css, custom_js, snippets")');
  });

  it("still saves custom code when the new columns are missing", () => {
    const fn = src.slice(src.indexOf("export async function savePageSettings"));
    expect(fn).toContain("write({})");
  });
});

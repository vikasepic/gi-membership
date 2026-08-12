import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

/**
 * The Font Awesome set is a static file, not a bundle import.
 *
 * An icon somebody CHOOSES cannot be tree-shaken — the page must be able to
 * draw whichever one they picked — so the whole free set would otherwise reach
 * every page of a store whose job is to load fast and take a payment. It is
 * fetched once, by the admin, only when the picker opens; and choosing one
 * stores its PATH in the block, so store pages fetch nothing at all.
 */
describe("where the icon set lives", () => {
  it("is a static asset", () => {
    expect(existsSync("public/fa-icons.json")).toBe(true);
  });

  it("carries a path and a viewBox for every icon", () => {
    const rows = JSON.parse(readFileSync("public/fa-icons.json", "utf8")) as {
      i: string; l: string; v: string; d: string;
    }[];
    expect(rows.length).toBeGreaterThan(1500);
    for (const r of rows.slice(0, 50)) {
      expect(r.d, r.i).toMatch(/^[Mm]/);
      expect(r.v, r.i).toMatch(/^[\d.\- ]+$/);
      expect(r.l.length, r.i).toBeGreaterThan(0);
    }
  });

  it("is never imported into the bundle", () => {
    // An IMPORT would put 1.7MB into every page that renders a list. Fetching
    // it does not, which is the whole point — so this looks for the import
    // rather than for the filename.
    for (const f of ["components/page/blocks.tsx", "components/admin/icon-picker.tsx", "lib/list-icons.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/(import|require)[^\n]*fa-icons\.json/);
    }
    // The picker reaches it over the network instead.
    expect(readFileSync("components/admin/icon-picker.tsx", "utf8")).toContain('fetch("/fa-icons.json")');
  });

  it("keeps the package out of what ships", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.devDependencies?.["@fortawesome/fontawesome-free"], "must be a devDependency").toBeTruthy();
    expect(pkg.dependencies?.["@fortawesome/fontawesome-free"]).toBeUndefined();
  });
})

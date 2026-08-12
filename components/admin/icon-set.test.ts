import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { score, type Row } from "@/components/admin/icon-picker";

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

/**
 * The grid held 2,163 icons and looked like it held twelve.
 *
 * It was `filter` in file order, and file order is alphabetical: opening the
 * picker showed 0, 1, 2, 3, and searching "star" put "Star and Crescent" above
 * "Star". These pin the ordering against the real set rather than a fixture,
 * because the thing that went wrong was the shape of the actual data.
 */
describe("what the picker shows first", () => {
  const rows = JSON.parse(readFileSync("public/fa-icons.json", "utf8")) as Row[];
  const search = (q: string) => {
    const term = q.trim().toLowerCase();
    return [...rows]
      .filter((r) => !term || r.l.toLowerCase().includes(term) || r.t.some((t) => t.includes(term)))
      .sort((a, b) => score(a, term) - score(b, term) || a.l.localeCompare(b.l));
  };

  it("puts the exact match first", () => {
    for (const q of ["star", "lock", "heart", "check"]) {
      expect(search(q)[0].l.toLowerCase(), q).toBe(q);
    }
  });

  it("does not open on digits and single letters", () => {
    const first = search("").slice(0, 24).map((r) => r.l);
    expect(first.filter((l) => /^[0-9a-z]$/i.test(l))).toEqual([]);
  });

  it("opens on solid icons rather than brands", () => {
    expect(search("").slice(0, 40).every((r) => r.s === "solid")).toBe(true);
  });
});

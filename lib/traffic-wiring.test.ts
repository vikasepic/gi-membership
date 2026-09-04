import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The four funnel pages each count their own view.
 *
 * A source-reading test because the alternative is rendering four server
 * components against a database, and the failure this catches is a call
 * being deleted or an await creeping in.
 *
 * It does NOT catch a fifth page added later — that page would have to be
 * added to PAGES too. Discovering funnel pages automatically would mean
 * listing every store page that is deliberately not counted, and that list
 * rots the same way this one does.
 */
const PAGES = [
  ["app/(store)/p/[slug]/page.tsx", "/p/"],
  ["app/(store)/o/[key]/page.tsx", "/o/"],
  ["app/(store)/checkout/page.tsx", "/checkout"],
  ["app/(store)/checkout/oto/page.tsx", "/checkout/oto"],
] as const;

describe("the funnel pages count their own views", () => {
  for (const [file] of PAGES) {
    it(`${file} records a hit`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("recordPageHit");
    });

    it(`${file} does not await it`, () => {
      // Awaiting would put a database write in front of the page. A count is
      // worth less than a page load, so it is fired and forgotten.
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/await\s+recordPageHit/);
      expect(src).toMatch(/void\s+recordPageHit/);
    });
  }

  it("middleware forwards the query the counter reads", () => {
    // Without this every visit buckets as direct: two of the four pages do
    // not receive searchParams, so the header is the only way the source is
    // knowable. It would fail silently — the counts would look fine and every
    // ad click would be filed as direct traffic.
    expect(readFileSync("middleware.ts", "utf8")).toContain(
      'withPath.set("x-search", req.nextUrl.search)',
    );
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The four funnel pages each count their own view, under the product it was
 * about.
 *
 * A source-reading test because the alternative is rendering four server
 * components against a database, and the failures this catches are a call
 * being deleted, an await creeping in, and — the new one — a page counting
 * itself with no product, which would put it back in the anonymous
 * "/checkout" bucket this whole change exists to get rid of.
 *
 * It does NOT catch a fifth page added later — that page would have to be
 * added to PAGES too. Discovering funnel pages automatically would mean
 * listing every store page that is deliberately not counted, and that list
 * rots the same way this one does.
 */
const PAGES = [
  // file, the call it must make, the product expression it must pass
  ["app/(store)/p/[slug]/page.tsx", "recordPageHit", "slug"],
  ["app/(store)/o/[key]/page.tsx", "recordPageHit", "key"],
  ["app/(store)/checkout/page.tsx", "recordPageHit", "product.slug"],
  ["app/(store)/checkout/oto/page.tsx", "recordOtoPageHit", "verified.payload.orderId"],
] as const;

describe("the funnel pages count their own views", () => {
  for (const [file, call, arg] of PAGES) {
    it(`${file} records a hit naming ${arg}`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain(`${call}(`);
      expect(src).toContain(arg);
    });

    it(`${file} does not await it`, () => {
      // Awaiting would put a database write in front of the page. A count is
      // worth less than a page load, so it is fired and forgotten.
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(new RegExp(`await\\s+${call}`));
      expect(src).toMatch(new RegExp(`void\\s+${call}`));
    });
  }

  it("the checkout counts the product it resolved, not the query it was given", () => {
    // ?product= is whatever the visitor typed. Counting it would let anyone
    // add rows to the table by loading /checkout with invented slugs, and the
    // funnel would fill with products that do not exist.
    const src = readFileSync("app/(store)/checkout/page.tsx", "utf8");
    expect(src).toMatch(/recordPageHit\("\/checkout",\s*product\.slug\)/);
    expect(src).not.toMatch(/recordPageHit\("\/checkout",\s*slug\)/);
  });

  it("middleware forwards the query the counter reads", () => {
    // Without this every visit buckets as direct: two of the four pages do
    // not receive searchParams, so the header is the only way the source is
    // knowable. It would fail silently — the counts would look fine and every
    // ad click would be filed as direct traffic.
    expect(readFileSync("proxy.ts", "utf8")).toContain(
      'withPath.set("x-search", req.nextUrl.search.slice(0, 2048))',
    );
  });
});

describe("an offer's funnel is counted at every step", () => {
  it("counts the offer's own checkout, under the offer's key", () => {
    // Without this the second step of every offer funnel is permanently zero.
    const src = readFileSync("app/(store)/checkout/offer/page.tsx", "utf8");
    expect(src).toContain('void recordPageHit("/checkout/offer", offer.key)');
  });

  it("counts it AFTER the guards, so a bounced visitor is not a checkout", () => {
    const src = readFileSync("app/(store)/checkout/offer/page.tsx", "utf8");
    const hit = src.indexOf('recordPageHit("/checkout/offer"');
    const bounce = src.indexOf("offer=already_owned");
    expect(bounce).toBeGreaterThan(-1);
    expect(hit).toBeGreaterThan(bounce);
  });

  it("files an offer-originated upsell view under the host offer", () => {
    // recordOtoPageHit resolves the order's BASE PRODUCT. An offer order has
    // none, so the hit was written with an empty product and belonged to no
    // funnel at all — 24 such rows in production on 9 Sep 2026.
    const src = readFileSync("lib/traffic.ts", "utf8");
    expect(src).toContain("host_offer_id");
    expect(src).toMatch(/orderFunnelKey|hostOfferKey/);
  });
});

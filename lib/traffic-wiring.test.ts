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

  // The behavioural version of "files an offer-originated upsell view under
  // the host offer" lives in lib/traffic.integration.test.ts, against a real
  // order and a real page_counts row. A source-reading version of that
  // assertion could only ever check that `host_offer_id` and
  // `orderFunnelKey` appear somewhere in the file — both also appear in
  // paidByOffer, so it would keep passing with the fallback deleted.
});

describe("the overview's source filter recomputes the funnels, it does not hide rows", () => {
  // The composition itself — restrict counts, then buildFunnels — is proven
  // by lib/traffic-funnel.test.ts. What can only be checked here, by reading
  // the page rather than rendering it against a database, is the ORDER: the
  // select's options have to be read off the window before it is narrowed.
  it("derives the select's options before the counts are narrowed by source", () => {
    const src = readFileSync("app/admin/traffic/page.tsx", "utf8");
    const sourcesIdx = src.indexOf("sourcesIn(rows)");
    const filterIdx = src.indexOf("counts.filter(");
    expect(sourcesIdx).toBeGreaterThan(-1);
    expect(filterIdx).toBeGreaterThan(sourcesIdx);
  });

  it("restricts the raw counts, then reshapes — not a filter over the shaped rows", () => {
    // The bug this replaces filtered `rows` (already-shaped OverviewRows) by
    // topSource, which could only ever hide a row, never recompute its
    // numbers. The fix filters `counts` and feeds the result straight back
    // into buildFunnels. Whitespace-normalised on both sides so wrapping this
    // call across lines — readability, not a behaviour change — cannot
    // silently break the assertion the way a literal ~140-char line once did.
    const normalize = (s: string) => s.replace(/\s+/g, " ");
    const src = normalize(readFileSync("app/admin/traffic/page.tsx", "utf8"));
    expect(src).toContain(normalize("buildFunnels(\n  counts.filter("));
  });

  it("passes source-filtered bought rows into the source-filtered view, not the unfiltered ones", () => {
    // Orders now carry a source (orders.utm_last, bucketed by sourceOfOrder
    // with the same rules a view gets), so the honest per-source order count
    // is `boughtRows` narrowed to this source — not `[]` (which used to force
    // every fourth step to zero) and not the unfiltered `boughtRows` (which
    // would show an ALL-source order count beside three source-filtered view
    // counts, letting biggestDrop compute a real-looking percentage from a
    // fall that never happened in this source's own numbers).
    const src = readFileSync("app/admin/traffic/page.tsx", "utf8");
    expect(src).toContain("boughtRows.filter((b) => b.source === filter.source)");
    expect(src).not.toContain("counts.filter((c) => c.source === filter.source), [],");
  });
});

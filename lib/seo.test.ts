import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { NOINDEX } from "@/lib/seo";

// Which pages a search engine may index. Getting this wrong puts somebody in
// the middle of a checkout they never started, or surfaces a one-time offer
// whose entire meaning is that it followed a purchase.

/** Pages that are a step, a private space, or an unpublished preview. */
const MUST_NOINDEX = [
  "app/(store)/checkout/page.tsx",
  "app/(store)/checkout/oto/page.tsx",
  "app/(store)/checkout/offer/page.tsx",
  "app/(store)/checkout/thank-you/page.tsx",
  "app/(store)/account/page.tsx",
  "app/(store)/library/page.tsx",
  "app/(store)/library/[slug]/page.tsx",
  "app/(store)/login/page.tsx",
  "app/oto-preview/[id]/page.tsx",
  "app/course-preview/[id]/page.tsx",
  "app/admin/layout.tsx",
];

/** Pages that EXIST to be found. A stray noindex here costs every sale. */
const MUST_INDEX = ["app/(store)/p/[slug]/page.tsx", "app/(store)/o/[key]/page.tsx"];

describe("what may be indexed", () => {
  it.each(MUST_NOINDEX)("%s is kept out of search", (file) => {
    expect(existsSync(file), file).toBe(true);
    expect(readFileSync(file, "utf8")).toContain("NOINDEX");
  });

  it.each(MUST_INDEX)("%s is left indexable", (file) => {
    expect(readFileSync(file, "utf8")).not.toContain("NOINDEX");
  });
});

describe("the tag itself", () => {
  it("says do not index", () => {
    expect(NOINDEX.robots).toMatchObject({ index: false });
  });

  it("still follows links, so terms and privacy keep their credit", () => {
    expect(NOINDEX.robots).toMatchObject({ follow: true });
  });

  it("says it to Google specifically as well", () => {
    // Googlebot reads its own directive in preference to the generic one.
    expect(NOINDEX.robots).toMatchObject({ googleBot: { index: false } });
  });
});

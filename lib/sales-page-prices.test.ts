import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * Every page that renders a SalesPage has to hand it the prices.
 *
 * A Ways to pay block that names an offer needs that offer looking up, and the
 * lookup is server-side. SalesPage cannot do it itself — it is imported by the
 * editor's client components, so it may not touch anything server-only. That
 * leaves each caller responsible, which is four chances to forget, and three of
 * them were taken: the block said "that offer has no price showing" on the
 * page, then in the builder, then on the upsell, each found separately by
 * somebody looking at it rather than by anything here.
 *
 * So the fourth one is caught by this instead.
 */
const CALLERS = [
  "app/(store)/p/[slug]/page.tsx",
  "app/(store)/o/[key]/page.tsx",
  "components/oto/sections-template.tsx",
];

describe("pages that render a sales page", () => {
  it("each resolve the offers their blocks name", () => {
    for (const f of CALLERS) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} renders SalesPage`).toContain("<SalesPage");
      expect(src, `${f} never resolves byOffer — a Ways to pay block there will draw nothing`).toMatch(
        /offersForRows|byOffer/,
      );
    }
  });

  it("names every caller there is", () => {
    // If a fifth page starts rendering one, this list has to grow with it —
    // otherwise the guard silently stops guarding the thing it was written for.
    const found = execSync(
      "grep -rl '<SalesPage' app components --include=*.tsx | grep -v test | sort",
    )
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
    expect(found.sort()).toEqual([...CALLERS].sort());
  });
});

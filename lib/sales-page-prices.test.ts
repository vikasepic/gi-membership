import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { chosenPrices, newOfferPrice, shownPrices } from "@/lib/offer-prices";

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

describe("a Ways to pay block shows the prices it was told to", () => {
  it("shows the whole menu when nothing is ticked", () => {
    // Empty means ALL here, and one price on a placement. Getting these the
    // wrong way round already shipped once, as a builder showing two prices
    // above a live page showing one.
    const a = { ...newOfferPrice("a"), priceCents: 2900 };
    const b = { ...newOfferPrice("b"), priceCents: 19900 };
    expect(chosenPrices([a, b], []).map((p) => p.id)).toEqual(["a", "b"]);
    expect(chosenPrices([a, b], undefined).map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("shows only the ticked ones, in the offer's order", () => {
    const a = { ...newOfferPrice("a"), sortOrder: 0 };
    const b = { ...newOfferPrice("b"), sortOrder: 1 };
    const c = { ...newOfferPrice("c"), sortOrder: 2 };
    expect(chosenPrices([a, b, c], ["c", "a"]).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("never leaves the block empty when every ticked price is gone", () => {
    // Archived or deleted since somebody ticked it. A menu beats an empty box
    // on the page that takes the money.
    const a = newOfferPrice("a");
    expect(chosenPrices([a], ["deleted"]).map((p) => p.id)).toEqual(["a"]);
  });

  it("ignores an archived price even when it is ticked", () => {
    const a = newOfferPrice("a");
    const gone = { ...newOfferPrice("gone"), archived: true };
    expect(chosenPrices([a, gone], ["gone", "a"]).map((p) => p.id)).toEqual(["a"]);
  });

  it("is not the placement rule", () => {
    // shownPrices falls back to ONE price; this falls back to all of them.
    const a = newOfferPrice("a");
    const b = newOfferPrice("b");
    expect(shownPrices([a, b], []).length).toBe(1);
    expect(chosenPrices([a, b], []).length).toBe(2);
  });
});

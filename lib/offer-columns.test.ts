import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { OFFER_COLUMNS } from "@/lib/store";

/**
 * One list of offer columns, not three.
 *
 * It WAS three — lib/store.ts, lib/admin.ts, lib/library.ts — and they had
 * already drifted: the library's copy was missing page_alt_offer_id and two
 * lifecycle tag ids, so an offer loaded for a member was a different shape from
 * the same offer loaded for the storefront, and nothing failed. Three
 * hand-written lists of thirty-eight columns cannot stay equal.
 *
 * This matters more now than it did: the next slice adds a nested read of
 * offer_prices to that string. Adding it to two of three would give a
 * library-loaded offer no prices at all, on a path with no coverage.
 */
describe("the columns an Offer is built from", () => {
  it("is declared once", () => {
    for (const f of ["lib/admin.ts", "lib/library.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} restates the list instead of importing it`).not.toMatch(
        /const OFFER_COLUMNS\s*=/,
      );
      expect(src, `${f} does not import it`).toContain("OFFER_COLUMNS");
    }
  });

  it("still carries every column the readers had between them", () => {
    // The union of what the three lists asked for before they were merged —
    // including the three the library was missing, which is the drift itself.
    for (const col of [
      "page_alt_offer_id",
      "activecampaign_trial_tag_id",
      "activecampaign_cancelled_tag_id",
      "price_cents",
      "billing_type",
      "interval",
      "trial_days",
      "bump_accent",
      "oto_sections",
    ]) {
      expect(OFFER_COLUMNS, col).toContain(col);
    }
  });

  it("names no column twice", () => {
    const names = OFFER_COLUMNS.split(",").map((c) => c.trim());
    expect(new Set(names).size).toBe(names.length);
  });
});

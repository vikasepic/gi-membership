import { describe, it, expect } from "vitest";
import { duplicateRow, remapPriceIds, DROPPED_COLUMNS } from "@/lib/duplicate";

describe("what carries into a duplicate", () => {
  it("keeps the fields that describe the thing", () => {
    const out = duplicateRow(
      { id: "old", title: "Guide", price_cents: 1100, bump_offer_id: "off1" },
      { slug: "guide-copy" },
    );
    expect(out).toMatchObject({ title: "Guide", price_cents: 1100, bump_offer_id: "off1", slug: "guide-copy" });
  });

  it("drops the identity and the timestamps", () => {
    const out = duplicateRow({ id: "old", created_at: "x", updated_at: "y", title: "t" }, {});
    expect(out).not.toHaveProperty("id");
    expect(out).not.toHaveProperty("created_at");
    expect(out).not.toHaveProperty("updated_at");
  });

  it("drops every Stripe id", () => {
    // Two records pointing at one Stripe object means the first sale through
    // either rewrites the other's. The copy makes its own on first sale.
    const out = duplicateRow(
      {
        title: "t",
        stripe_product_id_test: "prod_a",
        stripe_price_id_test: "price_a",
        stripe_product_id_live: "prod_b",
        stripe_price_id_live: "price_b",
      },
      {},
    );
    for (const k of ["stripe_product_id_test", "stripe_price_id_test", "stripe_product_id_live", "stripe_price_id_live"]) {
      expect(out).not.toHaveProperty(k);
    }
  });

  it("lets the caller override anything, including a dropped column", () => {
    expect(duplicateRow({ id: "old", status: "published" }, { status: "draft" })).toEqual({ status: "draft" });
  });

  it("names every dropped column once", () => {
    expect(new Set(DROPPED_COLUMNS).size).toBe(DROPPED_COLUMNS.length);
  });
});

describe("price ids inside a duplicated record", () => {
  const map = new Map([["p1", "n1"], ["p2", "n2"]]);

  it("points them at the copy's own prices", () => {
    // The whole reason this function exists. These arrays are jsonb with no
    // foreign key, so a stale id writes cleanly and the copy's page then
    // offers the ORIGINAL's prices — no error, anywhere.
    expect(remapPriceIds(["p1", "p2"], map)).toEqual(["n1", "n2"]);
  });

  it("drops an id with no counterpart rather than carrying it", () => {
    expect(remapPriceIds(["p1", "gone"], map)).toEqual(["n1"]);
  });

  it("keeps the order the page was built in", () => {
    expect(remapPriceIds(["p2", "p1"], map)).toEqual(["n2", "n1"]);
  });

  it("treats anything that is not a list of ids as empty", () => {
    for (const bad of [null, undefined, {}, "p1", [1, 2], [{ id: "p1" }]]) {
      expect(remapPriceIds(bad, map)).toEqual([]);
    }
  });
});

import { describe, it, expect } from "vitest";
import { duplicateRow, remapBlockPriceIds, remapPriceIds } from "@/lib/duplicate";

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

describe("price ids inside a copied section's blocks", () => {
  const map = new Map([["p1", "n1"], ["p2", "n2"]]);
  const prices = (props: Record<string, unknown>) => ({ id: "b1", type: "prices", props, style: {} });

  it("re-points a block that sells whatever the page sells", () => {
    const out = remapBlockPriceIds({ blocks: [prices({ offerId: "", priceIds: ["p2", "p1"] })] }, map);
    expect((out!.blocks as { props: { priceIds: string[] } }[])[0].props.priceIds).toEqual(["n2", "n1"]);
  });

  it("leaves a block naming another offer alone", () => {
    // Shared reference. Its ids belong to a record the copy did not duplicate,
    // so they are still valid — remapping them would empty the block.
    expect(remapBlockPriceIds({ blocks: [prices({ offerId: "off-2", priceIds: ["p1"] })] }, map)).toBeNull();
  });

  it("reaches a block inside a column", () => {
    const content = {
      blocks: [
        { id: "r", type: "row", props: {}, style: {}, columns: [[prices({ offerId: "", priceIds: ["p1"] })]] },
      ],
    };
    const out = remapBlockPriceIds(content, map) as { blocks: { columns: { props: { priceIds: string[] } }[][] }[] };
    expect(out.blocks[0].columns[0][0].props.priceIds).toEqual(["n1"]);
  });

  it("says nothing changed rather than rewriting a section it did not touch", () => {
    for (const same of [
      { blocks: [] },
      { blocks: [prices({ offerId: "", priceIds: [] })] },
      { blocks: [{ id: "h", type: "heading", props: { text: "hi" }, style: {} }] },
      {},
      null,
      "nonsense",
    ]) {
      expect(remapBlockPriceIds(same, map)).toBeNull();
    }
  });

  it("keeps everything else about the block", () => {
    const out = remapBlockPriceIds(
      { version: 2, blocks: [prices({ offerId: "", priceIds: ["p1"], heading: "Pick one" })] },
      map,
    ) as { version: number; blocks: { style: unknown; props: Record<string, unknown> }[] };
    expect(out.version).toBe(2);
    expect(out.blocks[0].props.heading).toBe("Pick one");
    expect(out.blocks[0].style).toEqual({});
  });
});

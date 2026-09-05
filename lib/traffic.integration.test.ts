import { describe, it, expect, beforeEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { bumpPageCountOrThrow, pageCountsSince, paidByProduct, productNames } from "@/lib/traffic";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!canRun)("counting page views (integration)", () => {
  beforeEach(async () => {
    const db = createServiceClient();
    await db.from("page_counts").delete().eq("store_id", await getStoreId());
  });

  it("counts a view", async () => {
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    const rows = await pageCountsSince(7);
    expect(rows).toContainEqual(
      expect.objectContaining({ path: "/p/thing", source: "meta", product: "thing", hits: 1 }),
    );
  });

  it("increments rather than adding a second row", async () => {
    // The whole point of doing it in one statement: a read-then-write would
    // lose one of two visitors arriving together.
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    const rows = (await pageCountsSince(7)).filter((r) => r.path === "/p/thing");
    expect(rows).toHaveLength(1);
    expect(rows[0].hits).toBe(3);
  });

  it("keeps sources apart on the same page", async () => {
    await bumpPageCountOrThrow("/p/thing", "meta", "thing");
    await bumpPageCountOrThrow("/p/thing", "direct", "thing");
    const rows = (await pageCountsSince(7)).filter((r) => r.path === "/p/thing");
    expect(rows).toHaveLength(2);
  });

  it("keeps two products' checkouts apart", async () => {
    // The reason the column exists. Before it, both of these were the row
    // "/checkout" and there was no way to know whose checkout it was.
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    await bumpPageCountOrThrow("/checkout", "meta", "carousels");
    const rows = (await pageCountsSince(7)).filter((r) => r.path === "/checkout");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.product).sort()).toEqual(["carousels", "validator"]);
  });

  it("still increments now the key has five columns", async () => {
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    const rows = (await pageCountsSince(7)).filter((r) => r.path === "/checkout");
    expect(rows).toHaveLength(1);
    expect(rows[0].hits).toBe(2);
  });

  it("returns nothing rather than throwing when there is no traffic", async () => {
    expect(await pageCountsSince(7)).toEqual([]);
  });

  it("names the store's products", async () => {
    const names = await productNames();
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      expect(typeof n.slug).toBe("string");
      expect(typeof n.title).toBe("string");
    }
  });

  it("counts orders per product without throwing", async () => {
    // Asserting the SHAPE, not a figure: the seed's order set is not this
    // test's to pin down, and a test that hard-codes it fails the next time
    // somebody adds a fixture.
    const bought = await paidByProduct(90);
    expect(Array.isArray(bought)).toBe(true);
    for (const b of bought) {
      expect(typeof b.product).toBe("string");
      expect(b.orders).toBeGreaterThan(0);
    }
  });
});

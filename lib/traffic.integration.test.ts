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

  it("counts the live paid order and not the test-mode one", async () => {
    // The shape assertion this replaces could not fail: `paidByProduct`
    // catches its own errors and returns [], which is an array whose zero
    // rows all pass a per-row type check. Two test-mode paid orders sit in
    // the production table, so the livemode filter is the thing worth
    // pinning, and it needs fixtures of its own to pin it.
    const db = createServiceClient();
    const store = await getStoreId();
    const { data: product } = await db
      .from("products")
      .select("id, slug")
      .eq("store_id", store)
      .limit(1)
      .single();
    expect(product).toBeTruthy();

    const live = crypto.randomUUID();
    const test = crypto.randomUUID();
    const countFor = async () =>
      (await paidByProduct(90)).find((b) => b.product === product!.slug)?.orders ?? 0;

    // A delta, not an absolute: the seed's own orders are not this test's to
    // pin down, but the number of ITS OWN orders that get counted is.
    const before = await countFor();
    try {
      await db.from("orders").insert([
        { id: live, store_id: store, email: "live@example.com", status: "paid", total_cents: 100, livemode: true },
        { id: test, store_id: store, email: "test@example.com", status: "paid", total_cents: 100, livemode: false },
      ]);
      await db.from("order_items").insert(
        [live, test].map((order_id) => ({
          store_id: store,
          order_id,
          kind: "product",
          product_id: product!.id,
          description: "fixture",
          amount_cents: 100,
        })),
      );

      expect(await countFor()).toBe(before + 1);
    } finally {
      // order_items cascades on the order, but delete it explicitly so a
      // failed orders insert cannot leave items behind either.
      await db.from("order_items").delete().in("order_id", [live, test]);
      await db.from("orders").delete().in("id", [live, test]);
    }
  });
});

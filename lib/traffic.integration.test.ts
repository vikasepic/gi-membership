import { describe, it, expect, beforeEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { bumpPageCountOrThrow, trafficByPage } from "@/lib/traffic";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!canRun)("counting page views (integration)", () => {
  beforeEach(async () => {
    const db = createServiceClient();
    await db.from("page_counts").delete().eq("store_id", await getStoreId());
  });

  it("counts a view", async () => {
    await bumpPageCountOrThrow("/p/thing", "meta");
    const rows = await trafficByPage(7);
    expect(rows).toContainEqual({ path: "/p/thing", source: "meta", product: "", hits: 1 });
  });

  it("increments rather than adding a second row", async () => {
    // The whole point of doing it in one statement: a read-then-write would
    // lose one of two visitors arriving together.
    await bumpPageCountOrThrow("/p/thing", "meta");
    await bumpPageCountOrThrow("/p/thing", "meta");
    await bumpPageCountOrThrow("/p/thing", "meta");
    const rows = (await trafficByPage(7)).filter((r) => r.path === "/p/thing");
    expect(rows).toHaveLength(1);
    expect(rows[0].hits).toBe(3);
  });

  it("keeps sources apart on the same page", async () => {
    await bumpPageCountOrThrow("/p/thing", "meta");
    await bumpPageCountOrThrow("/p/thing", "direct");
    const rows = (await trafficByPage(7)).filter((r) => r.path === "/p/thing");
    expect(rows).toHaveLength(2);
  });

  it("returns nothing rather than throwing when there is no traffic", async () => {
    expect(await trafficByPage(7)).toEqual([]);
  });

  it("keeps two products' checkouts apart", async () => {
    // The whole reason for the column. Before it, both of these were the row
    // "/checkout" and there was no way to know whose checkout it was.
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    await bumpPageCountOrThrow("/checkout", "meta", "carousels");
    const rows = (await trafficByPage(7)).filter((r) => r.path === "/checkout");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.product).sort()).toEqual(["carousels", "validator"]);
  });

  it("still increments now the key has five columns", async () => {
    // The upsert has to conflict on the new key too. If the migration added
    // the column without rebuilding the primary key, this inserts duplicates.
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    await bumpPageCountOrThrow("/checkout", "meta", "validator");
    const rows = (await trafficByPage(7)).filter((r) => r.path === "/checkout");
    expect(rows).toHaveLength(1);
    expect(rows[0].hits).toBe(2);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { bumpPageCount, trafficByPage } from "@/lib/traffic";

const canRun = !!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1");

describe.skipIf(!canRun)("counting page views (integration)", () => {
  beforeEach(async () => {
    const db = createServiceClient();
    await db.from("page_counts").delete().eq("store_id", await getStoreId());
  });

  it("counts a view", async () => {
    await bumpPageCount("/p/thing", "meta");
    const rows = await trafficByPage(7);
    expect(rows).toContainEqual({ path: "/p/thing", source: "meta", hits: 1 });
  });

  it("increments rather than adding a second row", async () => {
    // The whole point of doing it in one statement: a read-then-write would
    // lose one of two visitors arriving together.
    await bumpPageCount("/p/thing", "meta");
    await bumpPageCount("/p/thing", "meta");
    await bumpPageCount("/p/thing", "meta");
    const rows = (await trafficByPage(7)).filter((r) => r.path === "/p/thing");
    expect(rows).toHaveLength(1);
    expect(rows[0].hits).toBe(3);
  });

  it("keeps sources apart on the same page", async () => {
    await bumpPageCount("/p/thing", "meta");
    await bumpPageCount("/p/thing", "direct");
    const rows = (await trafficByPage(7)).filter((r) => r.path === "/p/thing");
    expect(rows).toHaveLength(2);
  });

  it("returns nothing rather than throwing when there is no traffic", async () => {
    expect(await trafficByPage(7)).toEqual([]);
  });
});

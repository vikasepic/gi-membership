import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * A member's country follows their latest order that has one (0094), on every
 * checkout path, because a trigger on orders keeps it rather than each path.
 */
describe.skipIf(!canRun)("users.country (integration)", () => {
  const made: string[] = [];
  afterAll(async () => {
    const db = createServiceClient();
    for (const id of made) {
      await db.from("orders").delete().eq("user_id", id);
      await db.from("users").delete().eq("id", id);
      await db.auth.admin.deleteUser(id);
    }
  });

  it("takes the country of the latest order, and an older order filled in later does not overwrite it", async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();
    const email = `zz_country_${Date.now()}@example.com`;
    const { data: u } = await db.auth.admin.createUser({ email, password: "password12345", email_confirm: true });
    const id = u.user!.id;
    made.push(id);
    await db.from("users").insert({ id, store_id: storeId, email, username: "Zz Country" });
    const order = (at: string, country: string | null) => ({ store_id: storeId, user_id: id, email, status: "paid", total_cents: 0, currency: "usd", buyer_country: country, created_at: at });
    const { data: older } = await db.from("orders").insert(order("2026-09-01T00:00:00Z", null)).select("id").single();
    await db.from("orders").insert(order("2026-09-20T00:00:00Z", "AE"));
    const country = async () => (await db.from("users").select("country").eq("id", id).single()).data?.country;
    expect(await country()).toBe("AE");
    // A backfill reaching the older order afterwards leaves the newer country alone.
    await db.from("orders").update({ buyer_country: "GB" }).eq("id", older!.id);
    expect(await country()).toBe("AE");
  });
});

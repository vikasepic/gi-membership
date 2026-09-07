import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const USER_EMAIL = "zz-ownership-per-offer@example.test";

describe.skipIf(!canRun)("one access record per thing bought (integration)", () => {
  let storeId: string;
  let userId: string;

  beforeEach(async () => {
    const db = createServiceClient();
    storeId = await getStoreId();
    // users.id has no default (it mirrors auth.users.id) — every other
    // integration test in this repo supplies it explicitly; the brief's
    // insert omitted it and fails with 23502, so it is added here too.
    userId = crypto.randomUUID();
    await db.from("users").insert({ id: userId, store_id: storeId, email: USER_EMAIL });
  });

  afterEach(async () => {
    const db = createServiceClient();
    await db.from("ownership").delete().eq("user_id", userId);
    await db.from("users").delete().eq("id", userId);
  });

  const row = (offerId: string | null) => ({
    store_id: storeId,
    user_id: userId,
    app_id: APP,
    offer_id: offerId,
    source: "grant",
    status: "active",
  });

  it("admits two rows for the same app when the offers differ", async () => {
    // The whole point. Instagram and LinkedIn are two purchases of one app.
    const db = createServiceClient();
    const a = await db.from("ownership").insert(row("00000000-0000-0000-0000-0000000000c1"));
    const b = await db.from("ownership").insert(row("07f3d2f5-1694-4a2f-bc9e-7fec9dc164ed"));
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
  });

  it("still refuses a second row for the same offer", async () => {
    const db = createServiceClient();
    await db.from("ownership").insert(row("00000000-0000-0000-0000-0000000000c1"));
    const again = await db.from("ownership").insert(row("00000000-0000-0000-0000-0000000000c1"));
    expect(again.error?.code).toBe("23505");
  });

  it("refuses a second offer-less row, which NULLS NOT DISTINCT is what buys", async () => {
    // Postgres treats NULLs as distinct in a unique index by default, so
    // without that clause every app-originated row could duplicate forever.
    // One such row is live in production, so this is not hypothetical.
    const db = createServiceClient();
    const first = await db.from("ownership").insert(row(null));
    const second = await db.from("ownership").insert(row(null));
    expect(first.error).toBeNull();
    expect(second.error?.code).toBe("23505");
  });
});

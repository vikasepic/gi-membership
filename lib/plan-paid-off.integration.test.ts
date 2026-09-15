import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { markPlanPaidOff } from "@/lib/subscription-sync";
import { ownershipFor } from "@/lib/checkout";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRODUCT = "00000000-0000-0000-0000-0000000000b1";
let userId = "";

describe.skipIf(!canRun)("a plan paid off (integration)", () => {
  it("keeps ownership and forgets the subscription", async () => {
    const db = createServiceClient();
    userId = crypto.randomUUID();
    await db.from("users").insert({ id: userId, store_id: await getStoreId(), email: `zz-plan-${userId}@example.test` });
    const { error } = await db.from("ownership").insert({
      store_id: await getStoreId(),
      user_id: userId,
      product_id: PRODUCT,
      source: "purchase",
      status: "past_due",
      stripe_subscription_id: "sub_zz_plan",
    });
    if (error) throw new Error(error.message);

    expect(await markPlanPaidOff("sub_zz_plan")).toEqual({ paidOff: 1 });
    const { data } = await db
      .from("ownership")
      .select("status, stripe_subscription_id")
      .eq("user_id", userId)
      .order("id");
    expect(data).toEqual([{ status: "active", stripe_subscription_id: null }]);
    expect((await ownershipFor(userId)).productIds.has(PRODUCT)).toBe(true);
    // A second delivery of the event finds nothing to do.
    expect(await markPlanPaidOff("sub_zz_plan")).toEqual({ paidOff: 0 });
  });
});

afterAll(async () => {
  if (!canRun || !userId) return;
  const db = createServiceClient();
  await db.from("ownership").delete().eq("user_id", userId);
  await db.from("users").delete().eq("id", userId);
});

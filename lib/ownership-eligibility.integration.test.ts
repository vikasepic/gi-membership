import { describe, it, expect, afterAll } from "vitest";
import { ownershipFor, grantOfferOwnership } from "@/lib/checkout";
import { getOffer } from "@/lib/store";
import { shouldShowOffer } from "@/lib/offers";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const APP_ID = "00000000-0000-0000-0000-0000000000a1";
const createdUserIds: string[] = [];

async function member() {
  const db = createServiceClient();
  const email = `elig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(created.error?.message);
  const id = created.data.user.id;
  createdUserIds.push(id);
  await db.from("users").insert({ id, store_id: await getStoreId(), email, username: "elig" });
  return id;
}

describe.skipIf(!canRun)("offer eligibility vs ownership status (integration)", () => {
  it("a cancelled subscription no longer blocks the offer, so win-back is possible", async () => {
    const db = createServiceClient();
    const userId = await member();
    const storeId = await getStoreId();

    await db.from("ownership").insert({
      store_id: storeId, user_id: userId, app_id: APP_ID, source: "bump", status: "active",
    });
    expect((await ownershipFor(userId)).appIds.has(APP_ID)).toBe(true);

    // Cancelling keeps the row and flips the status — it must stop counting.
    await db.from("ownership").update({ status: "canceled" }).eq("user_id", userId).eq("app_id", APP_ID);
    expect((await ownershipFor(userId)).appIds.has(APP_ID)).toBe(false);
  });

  it("past_due still counts as held — Stripe is mid-retry, not gone", async () => {
    const db = createServiceClient();
    const userId = await member();
    await db.from("ownership").insert({
      store_id: await getStoreId(), user_id: userId, app_id: APP_ID, source: "bump", status: "past_due",
    });
    expect((await ownershipFor(userId)).appIds.has(APP_ID)).toBe(true);
  });

  it("re-granting after a cancellation revives the row instead of leaving it cancelled", async () => {
    const db = createServiceClient();
    const userId = await member();
    const storeId = await getStoreId();
    const offer = await getOffer("00000000-0000-0000-0000-0000000000c1");
    if (!offer) return; // seed offer absent

    await db.from("ownership").insert({
      store_id: storeId, user_id: userId, app_id: APP_ID, source: "bump", status: "canceled",
    });

    // The unique index on (store, user, app) makes this insert conflict. Before
    // the fix that 23505 was swallowed and the row stayed `canceled` — a buyer
    // could pay to resubscribe and still have no access.
    await grantOfferOwnership(storeId, userId, offer, "bump", "sub_reactivated");

    const { data } = await db
      .from("ownership").select("status, stripe_subscription_id")
      .eq("user_id", userId).eq("app_id", APP_ID).single();
    expect(data!.status).not.toBe("canceled");
    expect(data!.stripe_subscription_id).toBe("sub_reactivated");
    const rows = await db.from("ownership").select("id").eq("user_id", userId).eq("app_id", APP_ID);
    expect(rows.data).toHaveLength(1); // revived, not duplicated
  });

  it("a deactivated offer is hidden even from someone who owns nothing", async () => {
    const userId = await member();
    const owned = await ownershipFor(userId);
    const offer = await getOffer("00000000-0000-0000-0000-0000000000c1");
    if (!offer) return;
    expect(shouldShowOffer(offer, owned)).toBe(true);
    expect(shouldShowOffer({ ...offer, active: false }, owned)).toBe(false);
  });
});

afterAll(async () => {
  const db = createServiceClient();
  for (const id of createdUserIds) {
    await db.from("ownership").delete().eq("user_id", id);
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
});

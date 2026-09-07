import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const sent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/apps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/apps")>()),
  notifyAppEntitlement: sent,
}));

import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { grantOfferAccess, revokeOwnership } from "@/lib/members";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const APP = "00000000-0000-0000-0000-0000000000a1";
const USER_EMAIL = "zz-members-entitlement@example.test";

/**
 * The admin's grant and revoke buttons.
 *
 * Both hand-built `channels` from the single offer in front of them — the exact
 * call the purchase path stopped making. Comping LinkedIn to an Instagram
 * customer sent `channels: ["linkedin"]` and, since the app replaces rather
 * than merges, took Instagram away. Revoking one of two rows sent
 * `hasAccess: false` and killed both.
 */
describe.skipIf(!canRun)("granting and revoking by hand (integration)", () => {
  let storeId: string;
  let userId: string;
  let ig: string;
  let li: string;

  const makeOffer = async (channels: string[]) => {
    const db = createServiceClient();
    const id = crypto.randomUUID();
    const { error } = await db.from("offers").insert({
      id,
      store_id: storeId,
      key: `zz-members-${id}`,
      name: `zz members fixture (${channels.join("+")})`,
      grant_type: "subscription",
      grant_app_id: APP,
      grant_entitlement_key: "content-engine",
      grant_channels: channels,
      billing_type: "recurring",
      interval: "month",
      interval_count: 1,
      trial_days: 7,
      price_cents: 2900,
      currency: "usd",
      headline: "fixture",
      description: "fixture",
    });
    if (error) throw new Error(`test fixture: offer: ${error.message}`);
    return id;
  };

  beforeEach(async () => {
    const db = createServiceClient();
    sent.mockClear();
    storeId = await getStoreId();
    userId = crypto.randomUUID();
    await db.from("users").insert({ id: userId, store_id: storeId, email: USER_EMAIL, username: "Comp Fixture" });
    ig = await makeOffer(["instagram"]);
    li = await makeOffer(["linkedin"]);
  });

  afterEach(async () => {
    const db = createServiceClient();
    await db.from("ownership").delete().eq("user_id", userId);
    await db.from("users").delete().eq("id", userId);
    for (const id of [ig, li]) await db.from("offers").delete().eq("id", id);
  });

  const holdInstagram = async () => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("ownership")
      .insert({ store_id: storeId, user_id: userId, app_id: APP, offer_id: ig, source: "grant", status: "active" })
      .select("id")
      .single();
    if (error) throw new Error(`test fixture: ownership: ${error.message}`);
    return data.id as string;
  };

  it("adds the comped channel to what they already hold", async () => {
    await holdInstagram();
    expect(await grantOfferAccess({ userId, offerId: li, grantedBy: "admin@test" })).toEqual({ ok: true });

    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0][0]).toMatchObject({
      appId: APP,
      channels: ["instagram", "linkedin"],
      status: "active",
    });
  });

  it("revokes one subscription without taking the other away", async () => {
    const igRow = await holdInstagram();
    const db = createServiceClient();
    await db
      .from("ownership")
      .insert({ store_id: storeId, user_id: userId, app_id: APP, offer_id: li, source: "grant", status: "active" });

    sent.mockClear();
    expect(await revokeOwnership(igRow)).toEqual({ ok: true });

    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0][0]).toMatchObject({ channels: ["linkedin"], status: "active" });
  });

  it("still revokes access when it was the only subscription", async () => {
    const igRow = await holdInstagram();
    sent.mockClear();
    expect(await revokeOwnership(igRow)).toEqual({ ok: true });
    expect(sent.mock.calls[0][0]).toMatchObject({ channels: [], status: "canceled" });
  });
});

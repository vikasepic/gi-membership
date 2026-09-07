import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The app is never actually called — this is about the message, not the wire.
const sent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/apps", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/apps")>()),
  notifyAppEntitlement: sent,
}));

import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { pushOwnershipStateToApps } from "@/lib/app-sync";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const APP = "00000000-0000-0000-0000-0000000000a1";
const KEYED_OFFER = "00000000-0000-0000-0000-0000000000c1"; // entitlement key "content-engine"
const USER_EMAIL = "zz-entitlement-push@example.test";

/**
 * What an app is told when one of several subscriptions changes.
 *
 * `pushOwnershipStateToApps` unioned only the rows whose ids it was handed, and
 * every caller but the backfill hands it one row — the one a webhook just
 * touched. So cancelling Instagram sent `channels: []`, `hasAccess: false`, and
 * Content Engine (which replaces rather than merges) revoked the LinkedIn the
 * customer is still paying for.
 *
 * The ids say WHOSE entitlement changed. They never say what it now is.
 */
describe.skipIf(!canRun)("what the app is told after one row changes (integration)", () => {
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
      key: `zz-push-${id}`,
      name: `zz push fixture (${channels.join("+")})`,
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

  const hold = async (offerId: string | null, status = "active") => {
    const db = createServiceClient();
    const { data, error } = await db
      .from("ownership")
      .insert({ store_id: storeId, user_id: userId, app_id: APP, offer_id: offerId, source: "grant", status })
      .select("id")
      .single();
    if (error) throw new Error(`test fixture: ownership: ${error.message}`);
    return data.id as string;
  };

  beforeEach(async () => {
    const db = createServiceClient();
    sent.mockClear();
    storeId = await getStoreId();
    userId = crypto.randomUUID();
    await db.from("users").insert({ id: userId, store_id: storeId, email: USER_EMAIL, username: "Push Fixture" });
    ig = await makeOffer(["instagram"]);
    li = await makeOffer(["linkedin"]);
  });

  afterEach(async () => {
    const db = createServiceClient();
    await db.from("ownership").delete().eq("user_id", userId);
    await db.from("users").delete().eq("id", userId);
    for (const id of [ig, li]) await db.from("offers").delete().eq("id", id);
  });

  it("keeps LinkedIn alive when Instagram is cancelled", async () => {
    const igRow = await hold(ig);
    await hold(li);

    // The webhook's half of a cancellation: flip that row, announce the change.
    const db = createServiceClient();
    await db.from("ownership").update({ status: "canceled" }).eq("id", igRow);
    await pushOwnershipStateToApps([igRow]);

    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0][0]).toMatchObject({
      appId: APP,
      channels: ["linkedin"],
      status: "active",
    });
  });

  it("still revokes everything when the last subscription goes", async () => {
    const igRow = await hold(ig);
    const db = createServiceClient();
    await db.from("ownership").update({ status: "canceled" }).eq("id", igRow);
    await pushOwnershipStateToApps([igRow]);

    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0][0]).toMatchObject({ channels: [], status: "canceled" });
  });

  it("carries the entitlement key of a paying row, not of whichever row came first", async () => {
    // Production holds an `offer_id IS NULL` row whose entitlement key is null.
    // Grouped beside a purchased row, array order decided whether the message
    // carried the key or `null`. Inserted keyless-first on purpose, and sent
    // the way the backfill sends — every id at once, which is the caller that
    // put two rows in one group before the fix above made every caller do so.
    const keyless = await hold(null);
    const keyed = await hold(KEYED_OFFER);

    await pushOwnershipStateToApps([keyless, keyed]);

    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0][0]).toMatchObject({ entitlementKey: "content-engine" });
  });
});

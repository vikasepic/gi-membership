import { describe, it, expect, beforeAll, afterAll } from "vitest";

const { createServiceClient } = await import("@/lib/supabase/server");
const { getStoreId } = await import("@/lib/store");
const { recordOfferClick, recordMemberPageView, activityFor } = await import("@/lib/member-activity");

/**
 * What a member did, against the real tables (migration 0092): the pages they
 * opened and the library card they clicked, read back as one story.
 */

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const users: string[] = [];
const offers: string[] = [];
let storeId = "";

describe.skipIf(!canRun)("member activity (integration)", () => {
  const db = () => createServiceClient();
  beforeAll(async () => {
    storeId = await getStoreId();
  });

  async function member(): Promise<string> {
    const email = `zzact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const created = await db().auth.admin.createUser({ email, password: "password12345", email_confirm: true });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    users.push(created.data.user.id);
    await db().from("users").insert({ id: created.data.user.id, store_id: storeId, email });
    return created.data.user.id;
  }

  async function offer(): Promise<string> {
    const id = crypto.randomUUID();
    offers.push(id);
    const r = await db().from("offers").insert({
      id, store_id: storeId, key: `zz-act-${id}`, name: "zz Funnel App", grant_type: "subscription",
      grant_app_id: APP, grant_entitlement_key: `zz-act-${id}`, grant_channels: [], billing_type: "one_time",
      price_cents: 2900, currency: "usd", headline: "fixture", description: "fixture",
    });
    if (r.error) throw new Error(`fixture offer: ${r.error.message}`);
    return id;
  }

  it("reads pages and clicks back as one list, newest first, with the offer's name", async () => {
    const u = await member();
    const o = await offer();
    await recordMemberPageView({ userId: u, path: "/library" });
    await recordOfferClick({ userId: u, offerId: o, userAgent: "UA" });
    await recordMemberPageView({ userId: u, path: "/o/funnel-app" });
    const rows = await activityFor(u);
    expect(rows.map((r) => (r.kind === "view" ? r.path : `click:${r.offerName}`))).toEqual([
      "/o/funnel-app",
      "click:zz Funnel App",
      "/library",
    ]);
  });

  it("never throws: a failed log must not cost the member the page or the purchase", async () => {
    const ghost = crypto.randomUUID();
    await expect(recordMemberPageView({ userId: ghost, path: "/library" })).resolves.toBeUndefined();
    await expect(recordOfferClick({ userId: ghost, offerId: null })).resolves.toBeUndefined();
  });
});

afterAll(async () => {
  if (!canRun) return;
  const c = createServiceClient();
  for (const u of users) {
    await c.from("member_page_views").delete().eq("user_id", u);
    await c.from("library_offer_clicks").delete().eq("user_id", u);
    await c.from("users").delete().eq("id", u);
    await c.auth.admin.deleteUser(u);
  }
  for (const o of offers) await c.from("offers").delete().eq("id", o);
});

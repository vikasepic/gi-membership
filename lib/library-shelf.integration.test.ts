import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { listOwnedApps } from "@/lib/library";
import { shortDate } from "@/lib/dates";

/**
 * The library's app shelf against the real tables: one entry per app however
 * many purchases sit behind it, every channel the app has shown as included
 * or not, and the way to add a missing one (5 Oct 2026 redesign).
 */

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const stamp = Date.now();
let storeId = "";
let appId = "";
const offers: Record<string, string> = {};
const users: string[] = [];

describe.skipIf(!canRun)("the library shelf (integration)", () => {
  const db = () => createServiceClient();

  beforeAll(async () => {
    storeId = await getStoreId();
    const { data: app, error } = await db().from("apps").insert({
      store_id: storeId, key: `zz-shelf-${stamp}`, name: "zz Shelf Engine", base_url: "https://zz-shelf.example",
      shared_secret: "zz", channels: ["instagram", "linkedin"], active: false,
    }).select("id").single();
    if (error || !app) throw new Error(`fixture app: ${error?.message}`);
    appId = app.id as string;
    for (const [name, channels, price] of [["ig", ["instagram"], 2900], ["li", ["linkedin"], 2900]] as const) {
      const id = crypto.randomUUID();
      const r = await db().from("offers").insert({
        id, store_id: storeId, key: `zz-shelf-${name}-${stamp}`, name: `zz Shelf ${name}`, grant_type: "subscription",
        grant_app_id: appId, grant_entitlement_key: `zz-shelf-${stamp}`, grant_channels: channels, billing_type: "recurring",
        interval: "month", interval_count: 1, trial_days: 7, price_cents: price, currency: "usd", headline: "zz",
        description: "Write carousels and reels in proven formats. - and a list nobody reads", active: true,
      });
      if (r.error) throw new Error(`fixture offer: ${r.error.message}`);
      offers[name] = id;
    }
  });

  async function member(): Promise<string> {
    const id = crypto.randomUUID();
    await db().from("users").insert({ id, store_id: storeId, email: `zz-shelf-${id}@example.test` });
    users.push(id);
    return id;
  }
  const own = (userId: string, offer: string, status: string, sub: string | null = null) =>
    db().from("ownership").insert({ store_id: storeId, user_id: userId, app_id: appId, offer_id: offer, status, source: "purchase", stripe_subscription_id: sub });

  it("an Instagram-only member: one card, Instagram included, LinkedIn missing with the way to add it", async () => {
    const u = await member();
    const sub = `sub_zz_shelf_${stamp}`;
    const trialEnd = new Date(Date.now() + 3 * 86_400_000).toISOString();
    await db().from("subscriptions").insert({
      store_id: storeId, stripe_subscription_id: sub, user_id: u, offer_id: offers.ig, status: "trialing", amount_cents: 2900,
      currency: "usd", cancel_at_period_end: false, paid_invoices: 0, paid_total_cents: 0, livemode: false,
      started_at: new Date().toISOString(), trial_end: trialEnd,
    });
    await own(u, offers.ig, "trialing", sub);
    const shelf = (await listOwnedApps(u)).filter((a) => a.id === appId);
    expect(shelf).toHaveLength(1);
    expect(shelf[0].statusLine).toEqual({ tone: "trial", text: `Free trial · ends ${shortDate(trialEnd)}` });
    expect(shelf[0].description).toBe("Write carousels and reels in proven formats.");
    expect(shelf[0].badges).toEqual([
      { channel: "instagram", label: "Instagram", included: true, addHref: null, addText: null },
      { channel: "linkedin", label: "LinkedIn", included: false, addHref: `/library/offer/${offers.li}`, addText: "Add LinkedIn to your plan for $29 a month" },
    ]);
    await db().from("subscriptions").delete().eq("stripe_subscription_id", sub);
  });

  it("LinkedIn bought later: still one card, now with both", async () => {
    const u = await member();
    await own(u, offers.ig, "active");
    await own(u, offers.li, "active");
    const shelf = (await listOwnedApps(u)).filter((a) => a.id === appId);
    expect(shelf).toHaveLength(1);
    expect(shelf[0].badges.map((b) => [b.channel, b.included])).toEqual([["instagram", true], ["linkedin", true]]);
    expect(shelf[0].statusLine.text).toBe("Active");
  });
});

afterAll(async () => {
  if (!canRun) return;
  const c = createServiceClient();
  for (const u of users) {
    await c.from("ownership").delete().eq("user_id", u);
    await c.from("users").delete().eq("id", u);
  }
  for (const o of Object.values(offers)) await c.from("offers").delete().eq("id", o);
  if (appId) await c.from("apps").delete().eq("id", appId);
});

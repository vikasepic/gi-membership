import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { loadMoneyData } from "@/lib/money-data";

/**
 * What the money loader carries for the read-only role and the Journeys
 * report (18 Nov 2026): who is read-only, and how and when access was got.
 * Spec: docs/superpowers/specs/2026-11-18-journeys-and-read-only-login-design.md
 */

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const stamp = Date.now();
const userId = crypto.randomUUID();
let appId = "";

describe.skipIf(!canRun)("loadMoneyData (integration)", () => {
  const db = () => createServiceClient();

  beforeAll(async () => {
    const storeId = await getStoreId();
    const { data: app, error } = await db().from("apps").insert({
      store_id: storeId, key: `zz-money-${stamp}`, name: "zz Money Loader", base_url: "https://zz-money.example",
      shared_secret: "zz", channels: [], active: false,
    }).select("id").single();
    if (error || !app) throw new Error(`fixture app: ${error?.message}`);
    appId = app.id as string;
    const u = await db().from("users").insert({ id: userId, store_id: storeId, email: `zz-money-${stamp}@example.test`, is_viewer: true });
    if (u.error) throw new Error(`fixture user: ${u.error.message}`);
    const o = await db().from("ownership").insert({ store_id: storeId, user_id: userId, app_id: appId, status: "active", source: "grant", granted_by: "zz-owner@example.test" });
    if (o.error) throw new Error(`fixture ownership: ${o.error.message}`);
  });

  afterAll(async () => {
    await db().from("ownership").delete().eq("user_id", userId);
    await db().from("users").delete().eq("id", userId);
    if (appId) await db().from("apps").delete().eq("id", appId);
  });

  it("says who has read-only access", async () => {
    const d = await loadMoneyData();
    expect(d.users.find((u) => u.id === userId)?.isViewer).toBe(true);
  });

  it("says how each piece of access was got, and when", async () => {
    const d = await loadMoneyData();
    const row = d.ownership.find((o) => o.userId === userId);
    expect(row?.source).toBe("grant");
    // A hand grant names who gave it; the offer checkout writes source "grant" with nobody.
    expect(row?.grantedBy).toBe("zz-owner@example.test");
    expect(Number.isNaN(new Date(row?.createdAt ?? "").getTime())).toBe(false);
  });
});

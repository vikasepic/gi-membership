import { describe, it, expect, afterAll } from "vitest";
import { recordAppEntitlement, applyPendingEntitlements, appForSecret } from "@/lib/app-sync";
import { ensureUserProfile } from "@/lib/users";
import { ownershipFor } from "@/lib/checkout";
import { getStandingOffer } from "@/lib/library";
import { isOfferEligible } from "@/lib/offers";
import { listApps } from "@/lib/apps";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const emails: string[] = [];

async function app() {
  const apps = await listApps();
  return apps[0] ?? null;
}

describe.skipIf(!canRun)("app -> store entitlement sync (integration)", () => {
  it("refuses an inactive app's secret, so deactivating is a real kill switch", async () => {
    // appForSecret filters on active. Two consequences worth pinning:
    //
    // Deactivating an app must stop it granting access, or the flag is
    // decorative — that is the reason the filter exists.
    //
    // And an app registered before its endpoints are built cannot test its
    // secret against us: it gets a 401 indistinguishable from a wrong secret.
    // Every brief says so explicitly; if this behaviour is ever relaxed, that
    // paragraph becomes a lie and should be removed with it.
    const db = createServiceClient();
    const secret = `inactive-app-secret-${Date.now()}`;
    const { data: created, error } = await db
      .from("apps")
      .insert({
        store_id: await getStoreId(),
        key: `test-inactive-${Date.now()}`,
        name: "Test Inactive App",
        base_url: "https://example.invalid",
        shared_secret: secret,
        active: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    expect(await appForSecret(secret)).toBeNull();

    // Same secret, once active, is accepted — proving it was the flag and not
    // the secret that caused the refusal.
    await db.from("apps").update({ active: true }).eq("id", created.id as string);
    expect((await appForSecret(secret))?.id).toBe(created.id);

    await db.from("apps").delete().eq("id", created.id as string);
  });

  it("suppresses the offer for someone who subscribed inside the app first", async () => {
    const a = await app();
    if (!a) return; // no connected app configured

    const db = createServiceClient();
    const email = `appfirst_${Date.now()}@example.com`;
    emails.push(email);

    // 1. They subscribe INSIDE the app. No store account exists yet, so the
    //    store parks it rather than dropping it.
    const parked = await recordAppEntitlement({
      app: a,
      email,
      entitlementKey: "content-engine",
      status: "active",
      stripeSubscriptionId: "sub_app_created",
    });
    expect(parked).toEqual({ ok: true, linked: false });

    // 2. Later they create a store account. Creating the profile claims it.
    const created = await db.auth.admin.createUser({
      email,
      password: "password12345",
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    await ensureUserProfile(userId);

    // 3. The store now knows they have it — so the offer is NOT eligible.
    //    Before this sync existed, accepting it would have started a SECOND
    //    subscription and billed them twice.
    const owned = await ownershipFor(userId);
    expect(owned.appIds.has(a.id)).toBe(true);

    const offer = await getStandingOffer(userId);
    if (offer) expect(isOfferEligible(offer, owned)).toBe(false);
  });

  it("is idempotent — a repeated report never doubles the ownership row", async () => {
    const a = await app();
    if (!a) return;

    const db = createServiceClient();
    const email = `appdupe_${Date.now()}@example.com`;
    emails.push(email);
    const created = await db.auth.admin.createUser({
      email, password: "password12345", email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    await ensureUserProfile(userId);

    for (let i = 0; i < 3; i++) {
      const res = await recordAppEntitlement({
        app: a, email, entitlementKey: "content-engine",
        status: "active", stripeSubscriptionId: "sub_dupe",
      });
      expect(res).toEqual({ ok: true, linked: true });
    }
    const rows = await db.from("ownership").select("id").eq("user_id", userId).eq("app_id", a.id);
    expect(rows.data).toHaveLength(1);
  });

  it("applies a cancellation reported by the app", async () => {
    const a = await app();
    if (!a) return;

    const db = createServiceClient();
    const email = `appcancel_${Date.now()}@example.com`;
    emails.push(email);
    const created = await db.auth.admin.createUser({
      email, password: "password12345", email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    await ensureUserProfile(userId);

    await recordAppEntitlement({ app: a, email, entitlementKey: null, status: "active", stripeSubscriptionId: null });
    await recordAppEntitlement({ app: a, email, entitlementKey: null, status: "canceled", stripeSubscriptionId: null });

    const row = await db
      .from("ownership").select("status").eq("user_id", userId).eq("app_id", a.id).maybeSingle();
    expect(row.data?.status).toBe("canceled");
  });

  it("draining twice is safe — nothing is left parked and nothing duplicates", async () => {
    const a = await app();
    if (!a) return;

    const db = createServiceClient();
    const email = `appdrain_${Date.now()}@example.com`;
    emails.push(email);
    await recordAppEntitlement({ app: a, email, entitlementKey: null, status: "active", stripeSubscriptionId: null });

    const created = await db.auth.admin.createUser({
      email, password: "password12345", email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    await db.from("users").insert({ id: userId, store_id: await getStoreId(), email, username: "drain" });

    expect(await applyPendingEntitlements(userId, email)).toBe(1);
    expect(await applyPendingEntitlements(userId, email)).toBe(0); // already claimed

    const rows = await db.from("ownership").select("id").eq("user_id", userId).eq("app_id", a.id);
    expect(rows.data).toHaveLength(1);
  });
});

afterAll(async () => {
  const db = createServiceClient();
  for (const email of emails) {
    await db.from("pending_app_entitlements").delete().eq("email", email);
    const { data: u } = await db.from("users").select("id").eq("email", email).maybeSingle();
    if (!u) continue;
    await db.from("ownership").delete().eq("user_id", u.id);
    await db.from("users").delete().eq("id", u.id);
    await db.auth.admin.deleteUser(u.id as string);
  }
});

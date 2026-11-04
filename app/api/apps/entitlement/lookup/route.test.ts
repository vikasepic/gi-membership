import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { POST } from "./route";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const stamp = Date.now();
const keyA = `zz-lookup-a-${stamp}`;
const keyB = `zz-lookup-b-${stamp}`;
const secretA = `zz-secret-a-${stamp}`;
const secretB = `zz-secret-b-${stamp}`;
const parkedEmail = `zz-parked-${stamp}@example.com`;

const post = (body: unknown, secret?: string) =>
  POST(
    new Request("https://grow.greaterinside.com/api/apps/entitlement/lookup", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-store-secret": secret } : {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

// Two external apps so the scoping test has something to be scoped away from.
// external requires base_url and shared_secret (apps_external_has_endpoint),
// and channels must be a subset of the known list (apps_channels_known).
async function seed() {
  const db = createServiceClient();
  const storeId = await getStoreId();
  await db.from("apps").insert([
    {
      store_id: storeId,
      key: keyA,
      name: "ZZ Lookup A",
      kind: "external",
      base_url: "https://zz-a.example.com",
      shared_secret: secretA,
      channels: ["instagram", "linkedin"],
      active: true,
    },
    {
      store_id: storeId,
      key: keyB,
      name: "ZZ Lookup B",
      kind: "external",
      base_url: "https://zz-b.example.com",
      shared_secret: secretB,
      channels: ["instagram"],
      active: true,
    },
  ]);
  const { data: apps } = await db
    .from("apps")
    .select("id, key")
    .eq("store_id", storeId)
    .in("key", [keyA, keyB]);
  const idOf = (k: string) => (apps ?? []).find((a) => a.key === k)?.id as string;

  // An app-reported entitlement parked against B only.
  await db.from("pending_app_entitlements").insert({
    store_id: storeId,
    app_id: idOf(keyB),
    email: parkedEmail,
    entitlement_key: "content-engine",
    status: "active",
  });
}

describe.skipIf(!canRun)("POST /api/apps/entitlement/lookup", () => {
  beforeAll(seed);

  afterAll(async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();
    const { data: apps } = await db
      .from("apps")
      .select("id")
      .eq("store_id", storeId)
      .in("key", [keyA, keyB]);
    const ids = (apps ?? []).map((a) => a.id as string);
    // FK order: the parked row references the app.
    if (ids.length) await db.from("pending_app_entitlements").delete().in("app_id", ids);
    await db.from("apps").delete().eq("store_id", storeId).in("key", [keyA, keyB]);
  });

  // The caller's identity comes from the secret, never from the body.
  it("refuses a request with no secret", async () => {
    expect((await post({ email: "nobody@example.com" })).status).toBe(401);
  });

  it("refuses a wrong secret", async () => {
    expect((await post({ email: "nobody@example.com" }, "not-a-real-secret")).status).toBe(401);
  });

  it("rejects a body that is not an email", async () => {
    expect((await post({ email: "not-an-email" }, secretA)).status).toBe(400);
  });

  // A definitive answer, so the asking app stops retrying. The three-state
  // reading on the other side turns a non-200 into "cannot tell" and keeps
  // waiting, so an unknown email must be 200 with hasAccess:false.
  it("answers 200 hasAccess:false for an email it has never seen", async () => {
    const res = await post({ email: `zz-nobody-${stamp}@example.com` }, secretA);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hasAccess: false });
  });

  // pending_app_entitlements carries no channels, so the honest answer is
  // access with no list. The contract reads an omitted list as "no change",
  // which is what stops the asking app inventing a grant.
  it("reports a parked app-reported entitlement as access with no channels", async () => {
    const res = await post({ email: parkedEmail }, secretB);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hasAccess: true });
  });

  // The whole reason the app comes from the secret: B's customer must be
  // invisible to A, or any connected app could enumerate another's buyers.
  it("does not leak another app's entitlement", async () => {
    const res = await post({ email: parkedEmail }, secretA);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hasAccess: false });
  });
});

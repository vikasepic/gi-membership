import "server-only";
import { createHmac } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";
import { getStoreId } from "@/lib/store";

// App registry + the store SIDE of the app bridge. The store is the system of
// record for accounts; each connected app gets a signed single-use handoff
// token and a server-to-server provision call. The app-side endpoints live in
// the app's own repo (see docs/app-bridge-contract.md).

export type AppRow = {
  id: string;
  key: string;
  name: string;
  baseUrl: string;
  provisionEndpoint: string;
  handoffEndpoint: string;
  sharedSecret: string;
  entitlementMapping: Record<string, string>;
  active: boolean;
};

const APP_COLUMNS =
  "id, key, name, base_url, provision_endpoint, handoff_endpoint, shared_secret, entitlement_mapping, active";

export async function listApps(): Promise<AppRow[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("apps")
    .select(APP_COLUMNS)
    .eq("store_id", await getStoreId())
    .order("created_at", { ascending: true });
  return camelize<AppRow[]>(data ?? []);
}

export async function getAppById(id: string): Promise<AppRow | null> {
  const db = createServiceClient();
  const { data } = await db.from("apps").select(APP_COLUMNS).eq("id", id).maybeSingle();
  return data ? camelize<AppRow>(data) : null;
}

// Signed with the APP's shared secret so the app can verify it. Short TTL; the
// app enforces single-use on arrival (provisioning by email is idempotent).
export function signHandoffToken(
  payload: { email: string; userId: string; appId: string; exp: number },
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function buildHandoffUrl(app: AppRow, user: { id: string; email: string }): string {
  const exp = Math.floor(Date.now() / 1000) + 5 * 60; // 5-minute TTL
  const token = signHandoffToken({ email: user.email, userId: user.id, appId: app.id, exp }, app.sharedSecret);
  const sep = app.handoffEndpoint.includes("?") ? "&" : "?";
  return `${app.baseUrl}${app.handoffEndpoint}${sep}token=${encodeURIComponent(token)}`;
}

// Server-to-server provision. Best-effort: never throws into the purchase flow.
// Records the outcome on the ownership row so failures can be retried.
export async function provisionAppSubscription(args: {
  appId: string;
  userId: string;
  email: string;
  entitlementKey: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const app = await getAppById(args.appId);
  if (!app || !app.active) return { ok: false, error: "app_inactive" };

  const url = `${app.baseUrl}${app.provisionEndpoint}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-store-secret": app.sharedSecret },
      body: JSON.stringify({
        email: args.email,
        entitlementKey: args.entitlementKey,
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
      }),
      signal: AbortSignal.timeout(5000),
    });
    // ponytail: on failure, a retry queue would live here — needs a
    // provisioning-status column on ownership. The handoff also re-provisions
    // on first arrival, so a one-off failure self-heals when the user opens the app.
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch_failed" };
  }
}

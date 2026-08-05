import "server-only";
import { createHmac } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";
import { getStoreId } from "@/lib/store";
import { recordError } from "@/lib/errors";

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
  payload: { email: string; userId: string; appId: string; exp: number; fullName?: string | null },
  secret: string,
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function buildHandoffUrl(
  app: AppRow,
  user: { id: string; email: string; fullName?: string | null },
): string {
  const exp = Math.floor(Date.now() / 1000) + 5 * 60; // 5-minute TTL
  // The name rides along here as well as on the provision call. Handoff is what
  // creates the session, so for anyone who arrives that way first it is the
  // only chance the app gets to learn what to call them.
  const token = signHandoffToken(
    { email: user.email, userId: user.id, appId: app.id, exp, fullName: user.fullName ?? null },
    app.sharedSecret,
  );
  const sep = app.handoffEndpoint.includes("?") ? "&" : "?";
  return `${app.baseUrl}${app.handoffEndpoint}${sep}token=${encodeURIComponent(token)}`;
}

// Server-to-server entitlement state. Sent when access is granted AND on every
// later change — trial converting, dunning, cancellation, refund. The app
// applies whatever `status` says, so this one call covers provisioning and
// deprovisioning and stays idempotent: re-sending the same state is a no-op.
//
// Best-effort by design: an app that is down must never break a purchase, a
// webhook, or a refund. `hasAccess` is included so an app doesn't have to
// encode our status semantics (past_due keeps access — Stripe is still
// retrying a card that may well succeed).
export async function notifyAppEntitlement(args: {
  appId: string;
  email: string;
  /**
   * What to call them, when the store knows.
   *
   * Without it an app has an email address and nothing else, so every account
   * it creates from a store sale is nameless — which is what happened to
   * everyone who bought a trial while already signed in.
   */
  fullName?: string | null;
  entitlementKey: string | null;
  status: "active" | "trialing" | "canceled" | "past_due";
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const app = await getAppById(args.appId);
  // Not queued: an app that is switched off is a decision someone made, not a
  // delivery that failed. Retrying it forever would fill the queue with work
  // that is meant not to happen.
  if (!app || !app.active) return { ok: false, error: "app_inactive" };

  const url = `${app.baseUrl}${app.provisionEndpoint}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-store-secret": app.sharedSecret },
      body: JSON.stringify({
        email: args.email,
        fullName: args.fullName ?? null,
        entitlementKey: args.entitlementKey,
        status: args.status,
        hasAccess: args.status !== "canceled",
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        occurredAt: Math.floor(Date.now() / 1000),
      }),
      signal: AbortSignal.timeout(5000),
      // A provision call is server-to-server and authenticated by the header.
      // If it gets bounced, it has been bounced to something that is not the
      // app — a login page, an SSO gate — and following the redirect would let
      // that page's 200 be read as "entitlement delivered". Funnel App's
      // middleware did exactly this: 307 to /login on both endpoints.
      redirect: "manual",
    });
    if (!res.ok) await queueRetry(args, `app returned ${res.status}`);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    const error = e instanceof Error ? e.message : "fetch_failed";
    await queueRetry(args, error);
    return { ok: false, error };
  }
}

/**
 * Queue a failed push so it is tried again.
 *
 * A missed GRANT self-heals — the handoff re-provisions the moment they open
 * the app. A missed REVOKE does not: nothing ever brings that person back to
 * trigger a correction, so they keep a product they stopped paying for, and
 * the only evidence is a support email that never comes. The runner and its
 * backoff already existed in lib/retry.ts; nothing had ever enqueued to it.
 */
async function queueRetry(
  args: Parameters<typeof notifyAppEntitlement>[0],
  message: string,
): Promise<void> {
  try {
    await recordError({
      source: "app_bridge",
      message: `Could not tell the app: ${message}`,
      context: { appId: args.appId, email: args.email, status: args.status },
      jobKind: "app_entitlement",
      jobPayload: args as unknown as Record<string, unknown>,
    });
  } catch (e) {
    // The queue itself is unreachable. Nothing further to do — the alternative
    // is failing a purchase or a refund over a bookkeeping write.
    console.error("[notifyAppEntitlement] could not queue a retry:", e);
  }
}

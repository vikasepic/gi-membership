import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { getAppById, notifyAppEntitlement, type AppRow, APP_COLUMNS } from "@/lib/apps";
import type { OwnershipStatus } from "@/lib/subscription-sync";
import { tagLifecycle } from "@/lib/ac-tags";

// Two-way entitlement sync.
//
// Outbound: whenever an app-granting ownership row changes state here, the app
// is told. Previously it was only told when access started, so a cancelled or
// refunded customer kept app access forever.
//
// Inbound: an app reports someone who subscribed inside the app. Without this
// the store would offer them the same subscription again, which breaks the rule
// that an offer is never shown to someone who already has what it grants.

const normEmail = (e: string) => e.trim().toLowerCase();

/**
 * Everything one person is entitled to in one app, as a single answer.
 *
 * Two subscriptions granting the same app used to send two messages under one
 * entitlement key, and the second overwrote the first — so buying LinkedIn
 * took Instagram away, or cancelling one left both unlocked, depending on
 * which side the receiving app came down on. The store decides instead.
 *
 * Only live rows contribute channels. A cancelled subscription's channels are
 * gone, which is the whole point: the receiving app replaces its list with
 * this one, so a channel that stops appearing is a channel that stops working.
 */
export function unionEntitlement(
  rows: { channels: string[]; status: OwnershipStatus }[],
): { channels: string[]; status: OwnershipStatus } {
  const live = rows.filter((r) => r.status === "active" || r.status === "trialing");
  const channels = [...new Set(live.flatMap((r) => r.channels ?? []))].sort();
  const status: OwnershipStatus = rows.some((r) => r.status === "trialing")
    ? "trialing"
    : rows.some((r) => r.status === "active")
      ? "active"
      : rows.some((r) => r.status === "past_due")
        ? "past_due"
        : "canceled";
  return { channels, status };
}

type EnrichedOwnershipRow = {
  appId: string;
  userId: string;
  status: OwnershipStatus;
  stripeSubscriptionId: string | null;
  email: string;
  fullName: string | null;
  entitlementKey: string | null;
  channels: string[];
  stripeCustomerId: string | null;
};

// Tell every app behind these ownership rows what their state is now. Ownership
// rows carry app_id; the buyer's email and the entitlement key come from the
// user and the offer that granted it.
//
// One person can hold two subscriptions to the same app (Instagram today,
// LinkedIn next week), so rows are grouped by (user, app) and sent as ONE
// message carrying the union of their channels — never one message per row,
// which is what let a second purchase silently overwrite the first.
export async function pushOwnershipStateToApps(ownershipIds: string[]): Promise<void> {
  if (ownershipIds.length === 0) return;
  const db = createServiceClient();

  const { data: rows } = await db
    .from("ownership")
    .select("id, app_id, user_id, status, stripe_subscription_id, offer_id")
    .in("id", ownershipIds)
    .not("app_id", "is", null);
  if (!rows || rows.length === 0) return;

  const enriched: EnrichedOwnershipRow[] = [];

  for (const row of rows) {
    const { data: user } = await db
      .from("users")
      .select("email, username")
      .eq("id", row.user_id as string)
      .maybeSingle();
    if (!user?.email) continue;

    let entitlementKey: string | null = null;
    // What the offer grants inside the app. Read here as well as at purchase,
    // because this is the replay path: an app that was down, or one that has
    // just learned to read channels, is caught up from what the offer says
    // NOW — which is the only reason a backfill is worth having.
    let channels: string[] = [];
    if (row.offer_id) {
      const { data: offer } = await db
        .from("offers")
        .select("grant_entitlement_key, grant_channels")
        .eq("id", row.offer_id as string)
        .maybeSingle();
      entitlementKey = (offer?.grant_entitlement_key as string) ?? null;
      channels = (offer?.grant_channels as string[] | null) ?? [];
    }

    // The customer id was hardcoded null here, which was harmless while this
    // only ran one row at a time after a change the app had just been told
    // about — but a bulk re-send would hand every entitlement a null, and an
    // app that stores what it receives would wipe the id it already had. Read
    // the real one instead; null now means "we genuinely have none".
    const { data: order } = await db
      .from("orders")
      .select("stripe_customer_id")
      .eq("user_id", row.user_id as string)
      .not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    enriched.push({
      appId: row.app_id as string,
      userId: row.user_id as string,
      status: row.status as OwnershipStatus,
      stripeSubscriptionId: (row.stripe_subscription_id as string) ?? null,
      email: user.email as string,
      fullName: (user.username as string | null) ?? null,
      entitlementKey,
      channels,
      stripeCustomerId: (order?.stripe_customer_id as string) ?? null,
    });
  }

  const groups = new Map<string, EnrichedOwnershipRow[]>();
  for (const r of enriched) {
    const key = `${r.userId}:${r.appId}`;
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }

  for (const group of groups.values()) {
    const first = group[0];
    const { channels, status } = unionEntitlement(group);
    // No longer a stable identifier once a person can hold two subscriptions
    // to the same app — prefer a live row's, falling back to the first.
    const liveRow = group.find((r) => r.status === "active" || r.status === "trialing");
    const stripeSubscriptionId = (liveRow ?? first).stripeSubscriptionId;

    // Best-effort, exactly like the original provision call: an app being down
    // must never break a webhook or a refund.
    await notifyAppEntitlement({
      appId: first.appId,
      email: first.email,
      fullName: first.fullName,
      entitlementKey: first.entitlementKey,
      channels,
      status,
      stripeCustomerId: first.stripeCustomerId,
      stripeSubscriptionId,
    });
  }
}

// Find the app whose shared secret matches. Apps authenticate to the store with
// the same secret the store uses to sign their handoff tokens, so a caller
// proves which app it is by presenting it. Compared in constant time.
export async function appForSecret(presented: string | null): Promise<AppRow | null> {
  if (!presented) return null;
  const db = createServiceClient();
  const { data } = await db
    .from("apps")
    // The shared list, not a copy of it. This WAS a copy, and it went stale
    // the moment apps grew a column — the select still worked, but the row it
    // returned was fed to getAppById, which reads the real list, so the two
    // disagreed about what an app is.
    .select(APP_COLUMNS)
    .eq("store_id", await getStoreId())
    .eq("active", true);

  const a = Buffer.from(presented, "utf8");
  for (const row of data ?? []) {
    const b = Buffer.from((row.shared_secret as string) ?? "", "utf8");
    // Length differs → not this app. Comparing same-length buffers only, so the
    // timing-safe compare never throws.
    if (a.length !== b.length) continue;
    const { timingSafeEqual } = await import("node:crypto");
    if (timingSafeEqual(a, b)) return (await getAppById(row.id as string)) ?? null;
  }
  return null;
}

export type InboundResult = { ok: true; linked: boolean };

// An app tells us one of its users has (or no longer has) an entitlement.
// Idempotent: the same report twice lands on the same single row.
export async function recordAppEntitlement(args: {
  app: AppRow;
  email: string;
  entitlementKey: string | null;
  status: OwnershipStatus;
  stripeSubscriptionId: string | null;
}): Promise<InboundResult> {
  const db = createServiceClient();
  const storeId = await getStoreId();
  const email = normEmail(args.email);

  const { data: user } = await db
    .from("users")
    .select("id")
    .eq("store_id", storeId)
    .eq("email", email)
    .maybeSingle();

  // No store account yet — park it by email. Draining happens the moment they
  // create one, so an app-first subscriber is never offered what they have.
  if (!user?.id) {
    await db
      .from("pending_app_entitlements")
      .upsert(
        {
          store_id: storeId,
          app_id: args.app.id,
          email,
          entitlement_key: args.entitlementKey,
          status: args.status,
          stripe_subscription_id: args.stripeSubscriptionId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "store_id,app_id,email" },
      );
    return { ok: true, linked: false };
  }

  await upsertAppOwnership({
    storeId,
    userId: user.id as string,
    appId: args.app.id,
    status: args.status,
    stripeSubscriptionId: args.stripeSubscriptionId,
  });
  await tagAppLifecycle(args.app.id, args.entitlementKey, user.id as string, args.status);
  return { ok: true, linked: true };
}

/**
 * Lifecycle tags for a sale the APP made, not the store.
 *
 * The tags live on offers and this sale came through none of them, so they are
 * resolved from the offers that grant this app and entitlement. A trial someone
 * started inside the app is still a trial, and leaving it untagged would put a
 * hole in exactly the segment these tags exist to build.
 *
 * If the monthly and yearly offers carry DIFFERENT tags, an app-direct sale
 * applies both — there is no way to know which one the app sold. Give the
 * offers for one product the same three tags and that never comes up.
 */
async function tagAppLifecycle(
  appId: string,
  entitlementKey: string | null,
  userId: string,
  status: OwnershipStatus,
): Promise<void> {
  try {
    const db = createServiceClient();
    let q = db.from("offers").select("id").eq("grant_app_id", appId);
    q = entitlementKey ? q.eq("grant_entitlement_key", entitlementKey) : q;
    const { data } = await q;
    const offerIds = (data ?? []).map((r) => r.id as string);
    if (offerIds.length > 0) await tagLifecycle({ userId, offerIds, status });
  } catch (e) {
    // An app told us about a sale; that fact is recorded. A CRM failure here
    // must not turn a 200 into a 500 and have them retry a sale we already have.
    console.error("[recordAppEntitlement] lifecycle tags failed:", e);
  }
}

// ownership has a partial unique index on (store_id, user_id, app_id), so this
// is an update-then-insert rather than an upsert: onConflict can't name a
// partial index.
async function upsertAppOwnership(args: {
  storeId: string;
  userId: string;
  appId: string;
  status: OwnershipStatus;
  stripeSubscriptionId: string | null;
}): Promise<void> {
  const db = createServiceClient();
  const { data: updated } = await db
    .from("ownership")
    .update({
      status: args.status,
      stripe_subscription_id: args.stripeSubscriptionId,
      updated_at: new Date().toISOString(),
    })
    .eq("store_id", args.storeId)
    .eq("user_id", args.userId)
    .eq("app_id", args.appId)
    .select("id");
  if (updated && updated.length > 0) return;

  const { error } = await db.from("ownership").insert({
    store_id: args.storeId,
    user_id: args.userId,
    app_id: args.appId,
    source: "app", // originated in the app, not in a store purchase
    status: args.status,
    stripe_subscription_id: args.stripeSubscriptionId,
  });
  // 23505 = a concurrent insert won. Its row is equivalent; nothing to do.
  if (error && error.code !== "23505") {
    throw new Error(`upsertAppOwnership: ${error.message}`);
  }
}

// Called the moment a store account exists for an email. Turns anything an app
// reported earlier into real ownership, so their first visit to the store
// already reflects what they bought elsewhere.
export async function applyPendingEntitlements(userId: string, email: string): Promise<number> {
  const db = createServiceClient();
  const storeId = await getStoreId();
  const { data: pending } = await db
    .from("pending_app_entitlements")
    .select("id, app_id, status, stripe_subscription_id")
    .eq("store_id", storeId)
    .eq("email", normEmail(email));
  if (!pending || pending.length === 0) return 0;

  for (const row of pending) {
    await upsertAppOwnership({
      storeId,
      userId,
      appId: row.app_id as string,
      status: row.status as OwnershipStatus,
      stripeSubscriptionId: (row.stripe_subscription_id as string) ?? null,
    });
    await db.from("pending_app_entitlements").delete().eq("id", row.id as string);
  }
  return pending.length;
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { getStoreId, getOffer } from "@/lib/store";
import { notifyAppEntitlement } from "@/lib/apps";
import { applyPendingEntitlements } from "@/lib/app-sync";

// Member (customer) views for admin, plus the Stripe Customer Portal that lets
// a customer manage their own card, plan and cancellation. The portal is hosted
// by Stripe on purpose: card details never touch this app.

export type MemberRow = {
  id: string;
  email: string;
  username: string | null;
  isAdmin: boolean;
  createdAt: string;
  orders: number;
  spentCents: number;
  courses: number;
  subscriptions: { appName: string; status: string; subscriptionId: string | null }[];
};

export async function listMembers(): Promise<MemberRow[]> {
  const db = createServiceClient();

  const { data: users, error } = await db
    .from("users")
    .select("id, email, username, is_admin, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listMembers: ${error.message}`);
  const ids = (users ?? []).map((u) => u.id as string);
  if (ids.length === 0) return [];

  const [{ data: orders }, { data: owns }, { data: apps }] = await Promise.all([
    db.from("orders").select("user_id, total_cents, status").in("user_id", ids),
    db.from("ownership").select("user_id, product_id, app_id, status, stripe_subscription_id").in("user_id", ids),
    db.from("apps").select("id, name"),
  ]);

  const appName = new Map((apps ?? []).map((a) => [a.id as string, a.name as string]));

  return (users ?? []).map((u) => {
    const uid = u.id as string;
    const paid = (orders ?? []).filter((o) => o.user_id === uid && o.status === "paid");
    const mine = (owns ?? []).filter((o) => o.user_id === uid);
    return {
      id: uid,
      email: u.email as string,
      username: (u.username as string) ?? null,
      isAdmin: Boolean(u.is_admin),
      createdAt: u.created_at as string,
      orders: paid.length,
      spentCents: paid.reduce((n, o) => n + ((o.total_cents as number) ?? 0), 0),
      courses: mine.filter((o) => o.product_id).length,
      subscriptions: mine
        .filter((o) => o.app_id)
        .map((o) => ({
          appName: appName.get(o.app_id as string) ?? "App",
          status: o.status as string,
          subscriptionId: (o.stripe_subscription_id as string) ?? null,
        })),
    };
  });
}

// Cancel at period end rather than immediately: the customer keeps what they
// already paid for until the term runs out, which is what "cancel" means to them.
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await stripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

// Stripe-hosted portal: update card, change plan, cancel, download invoices.
// Building these screens ourselves would mean handling card data; this way the
// PCI surface stays with Stripe.
export async function billingPortalUrl(userId: string, returnUrl: string): Promise<string | null> {
  const db = createServiceClient();
  const { data: order } = await db
    .from("orders")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!order?.stripe_customer_id) return null;

  const session = await stripe().billingPortal.sessions.create({
    customer: order.stripe_customer_id as string,
    return_url: returnUrl,
  });
  return session.url;
}

// ---------------------------------------------------------------------------
// Managing members by hand.
//
// These exist for the cases a checkout cannot cover: comping someone, fixing a
// purchase that failed to provision, honouring a sale made off-platform, or
// letting a beta user in. Every one of them grants real entitlement, so each
// records who did it and tells the connected app, exactly as a purchase would.
// ---------------------------------------------------------------------------

export type CreateMemberResult =
  | { ok: true; userId: string; existed: boolean }
  | { ok: false; error: string };

/**
 * Create a member by email, or return the one that already exists.
 *
 * No password is set — the same as a checkout signup. They sign in with a link.
 * Returning the existing user rather than erroring makes this safe to run twice
 * and lets "add and grant" work for someone already on the list.
 */
export async function createMember(args: {
  email: string;
  fullName?: string | null;
}): Promise<CreateMemberResult> {
  const email = args.email.trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, error: "That is not an email address." };

  const db = createServiceClient();
  const storeId = await getStoreId();

  const { data: existing } = await db
    .from("users")
    .select("id")
    .eq("store_id", storeId)
    .eq("email", email)
    .maybeSingle();
  if (existing?.id) return { ok: true, userId: existing.id as string, existed: true };

  const created = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: args.fullName ?? null },
  });

  // An auth user can exist without a profile row — someone who signed in but
  // never bought. Adopt it rather than failing.
  let userId = created.data.user?.id;
  if (created.error || !userId) {
    const { data: list } = await db.auth.admin.listUsers();
    const match = list?.users.find((u) => u.email?.toLowerCase() === email);
    if (!match) return { ok: false, error: created.error?.message ?? "Could not create the account." };
    userId = match.id;
  }

  const { error: profileErr } = await db.from("users").insert({
    id: userId,
    store_id: storeId,
    email,
    username: args.fullName?.trim() || email.split("@")[0],
  });
  if (profileErr && profileErr.code !== "23505") {
    return { ok: false, error: `profile: ${profileErr.message}` };
  }

  // A connected app may have reported this person before they had an account.
  await applyPendingEntitlements(userId, email);
  return { ok: true, userId, existed: false };
}

/** Give someone a product outright, with no charge. */
export async function grantProduct(args: {
  userId: string;
  productId: string;
  grantedBy: string;
}): Promise<{ ok: boolean; error?: string }> {
  const db = createServiceClient();
  const storeId = await getStoreId();
  const { error } = await db.from("ownership").insert({
    store_id: storeId,
    user_id: args.userId,
    product_id: args.productId,
    source: "grant",
    status: "active",
    granted_by: args.grantedBy,
  });
  // 23505 = they already own it, which is the desired end state anyway.
  if (error && error.code !== "23505") return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Give someone app access with no Stripe subscription behind it — a comp.
 *
 * The app is told the same way a paid subscription tells it, so the member can
 * actually use what they were given. It carries no subscription id, so nothing
 * renews and nothing can be cancelled in Stripe; revoking is done here.
 */
export async function grantOfferAccess(args: {
  userId: string;
  offerId: string;
  grantedBy: string;
}): Promise<{ ok: boolean; error?: string }> {
  const db = createServiceClient();
  const storeId = await getStoreId();
  const offer = await getOffer(args.offerId);
  if (!offer) return { ok: false, error: "That offer no longer exists." };

  const { data: user } = await db.from("users").select("email").eq("id", args.userId).maybeSingle();
  if (!user?.email) return { ok: false, error: "That member has no email on file." };

  const { error } = await db.from("ownership").insert({
    store_id: storeId,
    user_id: args.userId,
    offer_id: offer.id,
    app_id: offer.grantAppId,
    product_id: offer.grantProductId,
    source: "grant",
    status: "active",
    granted_by: args.grantedBy,
  });
  if (error && error.code !== "23505") return { ok: false, error: error.message };

  if (offer.grantAppId) {
    await notifyAppEntitlement({
      appId: offer.grantAppId,
      email: user.email as string,
      entitlementKey: offer.grantEntitlementKey,
      status: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
  }
  return { ok: true };
}

/**
 * Take access away.
 *
 * A product row is deleted; an app row is marked canceled and the app is told,
 * which is the same shape a refund uses — an app left serving someone whose
 * access was revoked is the failure that matters here.
 */
export async function revokeOwnership(ownershipId: string): Promise<{ ok: boolean; error?: string }> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("ownership")
    .select("id, user_id, app_id, offer_id, product_id")
    .eq("id", ownershipId)
    .maybeSingle();
  if (!row) return { ok: false, error: "That access record no longer exists." };

  if (row.app_id) {
    await db
      .from("ownership")
      .update({ status: "canceled" })
      .eq("id", ownershipId);
    const { data: user } = await db
      .from("users")
      .select("email")
      .eq("id", row.user_id as string)
      .maybeSingle();
    const offer = row.offer_id ? await getOffer(row.offer_id as string) : null;
    if (user?.email) {
      await notifyAppEntitlement({
        appId: row.app_id as string,
        email: user.email as string,
        entitlementKey: offer?.grantEntitlementKey ?? null,
        status: "canceled",
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      });
    }
  } else {
    await db.from("ownership").delete().eq("id", ownershipId);
  }
  return { ok: true };
}

/**
 * Flag or unflag an admin.
 *
 * ADMIN_EMAILS is separate and always wins, so nobody can remove the
 * break-glass accounts from in here and lock the team out.
 */
export async function setMemberAdmin(userId: string, isAdmin: boolean): Promise<void> {
  const db = createServiceClient();
  await db.from("users").update({ is_admin: isAdmin }).eq("id", userId);
}

/** What a member currently holds, for the admin row. */
export async function accessForMember(
  userId: string,
): Promise<{ id: string; label: string; kind: "product" | "app"; status: string; granted: boolean }[]> {
  const db = createServiceClient();
  const { data: rows } = await db
    .from("ownership")
    .select("id, product_id, app_id, status, source, granted_by")
    .eq("user_id", userId);
  if (!rows || rows.length === 0) return [];

  const productIds = rows.map((r) => r.product_id).filter(Boolean) as string[];
  const appIds = rows.map((r) => r.app_id).filter(Boolean) as string[];
  const [{ data: products }, { data: apps }] = await Promise.all([
    productIds.length ? db.from("products").select("id, title").in("id", productIds) : { data: [] },
    appIds.length ? db.from("apps").select("id, name").in("id", appIds) : { data: [] },
  ]);
  const pName = new Map((products ?? []).map((p) => [p.id as string, p.title as string]));
  const aName = new Map((apps ?? []).map((a) => [a.id as string, a.name as string]));

  return rows.map((r) => ({
    id: r.id as string,
    kind: r.app_id ? "app" : "product",
    label: r.app_id
      ? (aName.get(r.app_id as string) ?? "App")
      : (pName.get(r.product_id as string) ?? "Product"),
    status: r.status as string,
    granted: r.source === "grant",
  }));
}

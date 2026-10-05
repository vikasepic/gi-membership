import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import type { AppKind } from "@/lib/apps";
import { builtinAppRoute } from "@/lib/builtin-apps/registry";
import { camelize } from "@/lib/case";
import { getStoreId, hydrateOffer, hydrateProduct, OFFER_COLUMNS, PRODUCT_COLUMNS } from "@/lib/store";
import { ownershipFor } from "@/lib/checkout";
import { createClient } from "@/lib/supabase/server";
import { coursesForProduct } from "@/lib/courses";
import { isOfferEligible, type Ownership } from "@/lib/offers";
import type { Product, Offer } from "@/lib/types";
import {
  appInitials,
  appStatus,
  channelBadges,
  mergeAppRows,
  offerPriceLine,
  shortDescription,
  type ChannelBadge,
  type OwnedStatus,
  type StatusLine,
} from "@/lib/library-apps";


// Ownership-gated library reads + signed-URL delivery. Paid assets live in the
// PRIVATE bucket and are only ever reached through an ownership check here.

// The shared list plus the two the library alone needs. Written as a sum
// rather than a third hand-copied list — this one was already missing five
// columns the storefront reads, which is exactly how a product loaded for a
// member became a different shape from the same product on the shop.
const LIBRARY_PRODUCT_COLUMNS = `${PRODUCT_COLUMNS}, chapter_label, lesson_label`;

export async function listOwnedProducts(userId: string): Promise<Product[]> {
  const db = createServiceClient();
  const { data: owns } = await db
    .from("ownership")
    .select("product_id")
    .eq("user_id", userId)
    .not("product_id", "is", null);
  const ids = (owns ?? []).map((o) => o.product_id as string);
  if (ids.length === 0) return [];
  const { data } = await db.from("products").select(LIBRARY_PRODUCT_COLUMNS).in("id", ids);
  return (data ?? []).map(hydrateProduct);
}

export async function ownsProduct(userId: string, productId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db
    .from("ownership")
    .select("id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();
  return !!data;
}

export type LibraryApp = {
  id: string;
  key: string;
  name: string;
  /** internal opens a route on this site; external goes through the handoff. */
  kind: AppKind;
  /** Where an internal app opens. Null for external, and for a key with no code. */
  route: string | null;
  status: OwnedStatus;
  /** The one line of billing the card shows: trial end, a failed payment, an end date. */
  statusLine: StatusLine;
  host: string | null;
  /** Every channel the member owns in this app, across all their purchases of it. */
  channels: string[];
  /** Every channel the app has, included or not, with the way to add a missing one. */
  badges: ChannelBadge[];
  description: string | null;
  initials: string;
};

/**
 * The member's apps, one entry per app however many purchases sit behind it.
 *
 * It drew one card per purchase, so a member who added LinkedIn to Instagram
 * got two Content Engine cards (5 Oct 2026). Live rows only, the same three
 * statuses subscribedToApp counts: a cancelled row drew a card whose Open
 * button posted to an action that refused it.
 */
export async function listOwnedApps(userId: string, now = new Date()): Promise<LibraryApp[]> {
  const db = createServiceClient();
  const { data: owns } = await db
    .from("ownership")
    .select("app_id, status, offer_id, stripe_subscription_id")
    .eq("user_id", userId)
    .not("app_id", "is", null)
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  const rows = owns ?? [];
  if (rows.length === 0) return [];

  const appIds = [...new Set(rows.map((r) => r.app_id as string))];
  const offerIds = [...new Set(rows.map((r) => r.offer_id as string | null).filter(Boolean) as string[])];
  const subIds = [...new Set(rows.map((r) => r.stripe_subscription_id as string | null).filter(Boolean) as string[])];
  const [{ data: apps }, { data: offers }, { data: subs }, { data: addable }] = await Promise.all([
    db.from("apps").select("id, key, name, kind, base_url, channels").in("id", appIds),
    offerIds.length
      ? db.from("offers").select("id, grant_channels, description").in("id", offerIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    subIds.length
      ? db.from("subscriptions").select("stripe_subscription_id, status, trial_end, cancel_at, cancel_at_period_end, current_period_end").in("stripe_subscription_id", subIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    // The offers that sell one channel of an app on its own: where a missing
    // channel's "Add" goes. Oldest first, so the choice is the store's and not
    // the heap's.
    db.from("offers")
      .select("id, grant_app_id, grant_channels, price_cents, currency, billing_type, interval, interval_count, trial_days")
      .in("grant_app_id", appIds)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);
  const appById = new Map((apps ?? []).map((a) => [a.id as string, a]));
  const offerById = new Map((offers ?? []).map((o) => [o.id as string, o]));
  const subById = new Map((subs ?? []).map((x) => [x.stripe_subscription_id as string, x]));

  const merged = mergeAppRows(
    rows.map((r) => {
      const offer = r.offer_id ? offerById.get(r.offer_id as string) : undefined;
      return {
        appId: r.app_id as string,
        status: r.status as OwnedStatus,
        channels: ((offer?.grant_channels as string[] | null) ?? []),
        offerId: (r.offer_id as string | null) ?? null,
        description: shortDescription(offer?.description as string | null),
        subscriptionId: (r.stripe_subscription_id as string | null) ?? null,
      };
    }),
  );

  return merged.map((m) => {
    const app = appById.get(m.appId);
    const kind: AppKind = app?.kind === "internal" ? "internal" : "external";
    const key = (app?.key as string) ?? "";
    const name = (app?.name as string) ?? "App";

    // First offer (oldest) per channel that sells that channel alone.
    const addOffers: Record<string, { href: string; priceLabel: string }> = {};
    for (const o of addable ?? []) {
      const ch = (o.grant_channels as string[] | null) ?? [];
      if (o.grant_app_id !== m.appId || ch.length !== 1 || addOffers[ch[0]]) continue;
      addOffers[ch[0]] = {
        // Through the click route: it logs the tap and sends them to the
        // offer's sales page (or its checkout when it has none).
        href: `/library/offer/${o.id as string}`,
        priceLabel: offerPriceLine({
          billingType: o.billing_type as "one_time" | "recurring",
          interval: o.interval as string | null,
          intervalCount: o.interval_count as number | null,
          trialDays: null,
          priceCents: o.price_cents as number,
          currency: (o.currency as string) ?? "usd",
        }),
      };
    }

    // The trial's end, and an end date only when every subscription behind the
    // app is ending: cancelling Instagram while LinkedIn renews ends nothing.
    const live = m.subscriptionIds.map((id) => subById.get(id)).filter(Boolean) as Record<string, unknown>[];
    const endOf = (x: Record<string, unknown>) =>
      (x.cancel_at as string | null) ?? (x.cancel_at_period_end ? ((x.current_period_end as string | null) ?? null) : null);
    const ends = live.length > 0 && live.every((x) => endOf(x)) ? live.map(endOf).sort().at(-1)! : null;
    const trial = live.find((x) => x.status === "trialing");

    return {
      id: m.appId,
      key,
      name,
      kind,
      route: kind === "internal" ? builtinAppRoute(key) : null,
      status: m.status,
      statusLine: appStatus(m.status, live.length ? { trialEndsAt: (trial?.trial_end as string | null) ?? null, cancelsAt: ends } : null, now),
      // An internal app has no host of its own; it is this one.
      host: kind === "internal" ? null : hostOf(app?.base_url as string | undefined),
      channels: m.channels,
      badges: channelBadges((app?.channels as string[] | null) ?? [], m.channels, addOffers),
      description: m.description,
      initials: appInitials(name),
    };
  });
}

/** "contentengine.app" — where the button actually goes, without the scheme. */
function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function subscribedToApp(userId: string, appId: string): Promise<boolean> {
  const db = createServiceClient();
  // Not maybeSingle: since 0069 a person can hold one row per offer of the same
  // app, and maybeSingle over two rows errors — which this function would have
  // read as "not subscribed", offering them something they already pay for.
  //
  // And only LIVE rows count. A cancelled row is a record that they once had
  // it, not a subscription.
  const { data } = await db
    .from("ownership")
    .select("id")
    .eq("user_id", userId)
    .eq("app_id", appId)
    .in("status", ["active", "trialing", "past_due"])
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// A standing offer to surface in the library: an active subscription offer the
// buyer isn't already in. Returns the first eligible one (Content Engine today).
//
// Asks isOfferEligible rather than subscribedToApp, because "are they in this
// app?" is the wrong question once one app is sold as three subscriptions: an
// Instagram subscriber is in the app and should still be shown LinkedIn.
export async function getStandingOffer(
  userId: string,
  opts: { excludeAppIds?: string[] } = {},
): Promise<Offer | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("offers")
    .select(OFFER_COLUMNS)
    .eq("store_id", await getStoreId())
    .eq("active", true)
    .eq("grant_type", "subscription")
    // Oldest first, and `id` to break a same-timestamp tie. Without an order
    // the store's longest-standing subscription is not what comes back — the
    // row Postgres reaches first is, and that moves whenever any offer row is
    // written. This query decides what a member is offered; the choice is the
    // store's to make, not the heap's.
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  const owned = await ownershipFor(userId);
  // An app the member already has is offered on its own card ("Add LinkedIn
  // to your plan"), not a second time under "More from Greater Inside".
  const skip = new Set(opts.excludeAppIds ?? []);
  for (const offer of (data ?? []).map(hydrateOffer)) {
    if (offer.grantAppId && skip.has(offer.grantAppId)) continue;
    if (isOfferEligible(offer, owned)) return offer;
  }
  return null;
}

export async function getOwnedProduct(
  userId: string,
  slug: string,
): Promise<Product | null> {
  const db = createServiceClient();
  const { data: p } = await db
    .from("products")
    .select(LIBRARY_PRODUCT_COLUMNS)
    .eq("store_id", await getStoreId())
    .eq("slug", slug)
    .maybeSingle();
  if (!p) return null;
  const product = hydrateProduct(p);
  if (!(await ownsProduct(userId, product.id))) return null;
  return product;
}

// Mint a short-lived signed URL for a product's private asset — ONLY after the
// caller has confirmed ownership. TTL kept short; each request re-signs.
export async function signedAssetUrl(productId: string, ttlSeconds = 60): Promise<string | null> {
  const db = createServiceClient();
  const { data: prod } = await db
    .from("products")
    .select("media_path, media_mode")
    .eq("id", productId)
    .maybeSingle();
  if (!prod?.media_path || prod.media_mode !== "upload") return null;
  const { data } = await db.storage.from("paid-assets").createSignedUrl(prod.media_path as string, ttlSeconds);
  return data?.signedUrl ?? null;
}

// Product-level progress (lesson_id null). Manual check-then-write since the
// unique index is lesson-scoped. ponytail: fine for single-user writes.
export async function getProductProgress(
  userId: string,
  productId: string,
): Promise<{ completed: boolean; positionSeconds: number | null } | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("progress")
    .select("completed, position_seconds")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .is("lesson_id", null)
    .maybeSingle();
  return data ? { completed: data.completed as boolean, positionSeconds: data.position_seconds as number | null } : null;
}

export async function setProductProgress(
  userId: string,
  storeId: string,
  productId: string,
  patch: { completed?: boolean; positionSeconds?: number },
): Promise<void> {
  const db = createServiceClient();
  const { data: existing } = await db
    .from("progress")
    .select("id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .is("lesson_id", null)
    .maybeSingle();
  const row = {
    completed: patch.completed,
    position_seconds: patch.positionSeconds,
  };
  if (existing) {
    await db.from("progress").update(row).eq("id", existing.id);
  } else {
    await db.from("progress").insert({
      store_id: storeId,
      user_id: userId,
      product_id: productId,
      lesson_id: null,
      completed: patch.completed ?? false,
      position_seconds: patch.positionSeconds ?? null,
    });
  }
}

// What the person currently browsing the store already owns. Anonymous
// visitors own nothing, so the store keeps its normal buy CTAs for them.
// Lets the catalog and product pages offer "Access now" instead of asking
// someone to buy what they already have.
export async function ownedProductIdsForViewer(): Promise<Set<string>> {
  return (await viewerOwnership()).productIds;
}

/**
 * Everything the current viewer owns — products AND apps. Needed wherever an
 * offer is displayed, since an app subscription is not a product and would
 * otherwise be offered to someone who already subscribes.
 * An anonymous viewer owns nothing, so this is empty and costs no query.
 */
export async function viewerOwnership(): Promise<Ownership> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { productIds: new Set(), appIds: new Set(), appChannels: new Map() };
  return ownershipFor(user.id);
}

// Where "Access now" should land for an owned product: straight into the
// course when the product grants exactly one, otherwise the library index.
export async function accessHrefForProduct(productId: string): Promise<string> {
  const courses = await coursesForProduct(productId);
  return courses.length === 1 ? `/library/${courses[0].slug}` : "/library";
}

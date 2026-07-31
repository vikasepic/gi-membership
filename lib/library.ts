import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";
import { getStoreId } from "@/lib/store";
import { savedPaymentMethodFor, ownershipFor } from "@/lib/checkout";
import { createClient } from "@/lib/supabase/server";
import { coursesForProduct } from "@/lib/courses";
import type { Ownership } from "@/lib/offers";
import type { Product, Offer } from "@/lib/types";

const OFFER_COLUMNS =
  "id, key, name, grant_type, grant_product_id, grant_app_id, grant_entitlement_key, billing_type, interval, interval_count, trial_days, price_cents, compare_at_cents, currency, headline, description, bullets, image_url, accept_label, decline_label, active, activecampaign_tag_id, oto_template, oto_body, oto_video_url, oto_sections, stripe_product_id_test, stripe_product_id_live";

// Ownership-gated library reads + signed-URL delivery. Paid assets live in the
// PRIVATE bucket and are only ever reached through an ownership check here.

const PRODUCT_COLUMNS =
  "id, slug, title, tagline, description, type, price_cents, compare_at_cents, currency, media_mode, media_path, media_embed_url, cover_image_url, cover_path, activecampaign_tag_id, activecampaign_abandoned_tag_id, status, bump_offer_id, upsell_offer_id, is_placeholder, sort_order, chapter_label, lesson_label";

export async function listOwnedProducts(userId: string): Promise<Product[]> {
  const db = createServiceClient();
  const { data: owns } = await db
    .from("ownership")
    .select("product_id")
    .eq("user_id", userId)
    .not("product_id", "is", null);
  const ids = (owns ?? []).map((o) => o.product_id as string);
  if (ids.length === 0) return [];
  const { data } = await db.from("products").select(PRODUCT_COLUMNS).in("id", ids);
  return camelize<Product[]>(data ?? []);
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

export async function listOwnedApps(
  userId: string,
): Promise<{ id: string; name: string; status: string }[]> {
  const db = createServiceClient();
  const { data: owns } = await db
    .from("ownership")
    .select("app_id, status")
    .eq("user_id", userId)
    .not("app_id", "is", null);
  const rows = owns ?? [];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.app_id as string);
  const { data: apps } = await db.from("apps").select("id, name").in("id", ids);
  const nameById = new Map((apps ?? []).map((a) => [a.id as string, a.name as string]));
  return rows.map((r) => ({
    id: r.app_id as string,
    name: nameById.get(r.app_id as string) ?? "App",
    status: r.status as string,
  }));
}

export async function subscribedToApp(userId: string, appId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db
    .from("ownership")
    .select("id")
    .eq("user_id", userId)
    .eq("app_id", appId)
    .maybeSingle();
  return !!data;
}

// A standing offer to surface in the library: an active subscription offer the
// buyer isn't already in. Returns the first eligible one (Content Engine today).
export async function getStandingOffer(userId: string): Promise<Offer | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("offers")
    .select(OFFER_COLUMNS)
    .eq("store_id", await getStoreId())
    .eq("active", true)
    .eq("grant_type", "subscription");
  for (const offer of camelize<Offer[]>(data ?? [])) {
    if (offer.grantAppId && !(await subscribedToApp(userId, offer.grantAppId))) return offer;
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
    .select(PRODUCT_COLUMNS)
    .eq("store_id", await getStoreId())
    .eq("slug", slug)
    .maybeSingle();
  if (!p) return null;
  const product = camelize<Product>(p);
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

// Whether we can charge this member off-session without asking for a card.
// Drives which control the standing offer renders: a one-tap accept, or a link
// to the offer checkout. A button that cannot work should not be a button.
export async function hasSavedCard(userId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db
    .from("orders")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (!data?.stripe_customer_id) return false;
  return (await savedPaymentMethodFor(data.stripe_customer_id as string)) !== null;
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
  if (!user) return { productIds: new Set(), appIds: new Set() };
  return ownershipFor(user.id);
}

// Where "Access now" should land for an owned product: straight into the
// course when the product grants exactly one, otherwise the library index.
export async function accessHrefForProduct(productId: string): Promise<string> {
  const courses = await coursesForProduct(productId);
  return courses.length === 1 ? `/library/${courses[0].slug}` : "/library";
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";
import { getStoreId } from "@/lib/store";
import type { Product, Offer } from "@/lib/types";
import type { CourseItem } from "@/lib/curriculum";

const OFFER_COLUMNS =
  "id, key, name, grant_type, grant_product_id, grant_app_id, grant_entitlement_key, billing_type, interval, interval_count, trial_days, price_cents, compare_at_cents, currency, headline, description, bullets, image_url, accept_label, decline_label, active, stripe_product_id_test, stripe_product_id_live";

// Ownership-gated library reads + signed-URL delivery. Paid assets live in the
// PRIVATE bucket and are only ever reached through an ownership check here.

const PRODUCT_COLUMNS =
  "id, slug, title, tagline, description, type, price_cents, compare_at_cents, currency, media_mode, media_path, media_embed_url, cover_image_url, status, bump_offer_id, upsell_offer_id, is_placeholder, sort_order";

export type Lesson = CourseItem;

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
): Promise<{ product: Product; lessons: Lesson[] } | null> {
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

  const { data: ls } = await db
    .from("course_items")
    .select("id, product_id, parent_id, title, subtitle, body_html, video_embed_url, cover_path, attachments, is_published, sort_order")
    .eq("product_id", product.id)
    .eq("is_published", true)
    .order("sort_order", { ascending: true });
  return { product, lessons: camelize<Lesson[]>(ls ?? []) };
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

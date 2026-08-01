import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";
import type { Product, Offer } from "@/lib/types";

// Server-side catalog reads. Uses the service-role client: all reads are in
// RSC/route handlers, and tenant RLS is deferred until a second store exists
// (per plan). One store is seeded; we resolve it by its stable slug.

const STORE_SLUG = "greater-inside";

const PRODUCT_COLUMNS =
  "id, slug, title, tagline, description, type, price_cents, compare_at_cents, currency, media_mode, media_path, media_embed_url, cover_image_url, cover_path, activecampaign_tag_id, activecampaign_abandoned_tag_id, status, bump_offer_id, upsell_offer_id, is_placeholder, sort_order";

const OFFER_COLUMNS =
  "id, key, name, grant_type, grant_product_id, grant_app_id, grant_entitlement_key, billing_type, interval, interval_count, trial_days, price_cents, compare_at_cents, currency, headline, description, bullets, image_url, accept_label, decline_label, active, activecampaign_tag_id, bump_headline, bump_description, oto_template, oto_body, oto_video_url, oto_sections, oto_page, stripe_product_id_test, stripe_product_id_live";

export async function getStoreId(): Promise<string> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("stores")
    .select("id")
    .eq("slug", STORE_SLUG)
    .single();
  if (error || !data) throw new Error(`store '${STORE_SLUG}' not found: ${error?.message}`);
  return data.id as string;
}

export async function listPublishedProducts(): Promise<Product[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("store_id", await getStoreId())
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listPublishedProducts: ${error.message}`);
  return camelize<Product[]>(data ?? []);
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("store_id", await getStoreId())
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`getProductBySlug: ${error.message}`);
  return data ? camelize<Product>(data) : null;
}

export async function getOffer(id: string): Promise<Offer | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("offers").select(OFFER_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getOffer: ${error.message}`);
  return data ? camelize<Offer>(data) : null;
}

/**
 * Active recurring offers, for the storefront to present in their own right
 * rather than only as a checkout bump. A subscription is the most valuable
 * thing this store sells and was previously invisible until someone was already
 * buying something else.
 */
export async function listSubscriptionOffers(): Promise<Offer[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("offers")
    .select(OFFER_COLUMNS)
    .eq("active", true)
    .eq("billing_type", "recurring")
    .order("price_cents", { ascending: true });
  if (error) throw new Error(`listSubscriptionOffers: ${error.message}`);
  return (data ?? []).map((r) => camelize<Offer>(r));
}

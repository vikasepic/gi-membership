import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";
import type { Product, Offer } from "@/lib/types";
import { sortPrices, type OfferPrice } from "@/lib/offer-prices";

// Server-side catalog reads. Uses the service-role client: all reads are in
// RSC/route handlers, and tenant RLS is deferred until a second store exists
// (per plan). One store is seeded; we resolve it by its stable slug.

const STORE_SLUG = "greater-inside";

const PRODUCT_COLUMNS =
  "id, slug, title, tagline, description, type, price_cents, compare_at_cents, currency, media_mode, media_path, media_embed_url, cover_image_url, cover_path, activecampaign_tag_id, activecampaign_abandoned_tag_id, status, bump_offer_id, upsell_offer_id, bump_alt_offer_id, upsell_alt_offer_id, bump_price_ids, upsell_price_ids, is_placeholder, sort_order, checkout_note, checkout_bullets";

/**
 * Every column an Offer is built from — in ONE place.
 *
 * It was three: here, in lib/admin.ts and in lib/library.ts. They had already
 * drifted — the library's copy was missing page_alt_offer_id and two of the
 * lifecycle tag ids, so an offer loaded for a member was quietly a different
 * shape from the same offer loaded for the storefront. Three hand-written lists
 * of thirty-eight columns cannot stay equal, and the one that falls behind is
 * the one nobody reads.
 */
export const OFFER_COLUMNS =
  "id, key, name, grant_type, grant_product_id, grant_app_id, grant_entitlement_key, page_alt_offer_id, page_price_ids, billing_type, interval, interval_count, trial_days, price_cents, compare_at_cents, currency, headline, description, bullets, image_url, accept_label, decline_label, active, activecampaign_tag_id, activecampaign_trial_tag_id, activecampaign_cancelled_tag_id, bump_headline, bump_description, bump_banner, bump_bullets, bump_note, bump_accent, oto_template, oto_body, oto_video_url, oto_sections, oto_page, stripe_product_id_test, stripe_product_id_live, " +
  // The ways to pay, embedded rather than fetched one offer at a time: every
  // reader of an offer is a reader of its prices, and a second round trip per
  // offer on a storefront that lists them all is a query nobody would write on
  // purpose. camelize already recurses into nested arrays.
  "offer_prices(id, label, billing_type, interval, interval_count, trial_days, price_cents, compare_at_cents, sort_order, archived)";

/**
 * A row from `offers` with its prices, as an Offer.
 *
 * One place, because the prices arrive under `offer_prices` and have to be put
 * in order — and two readers sorting differently is how a checkout charges the
 * option beside the one that was ticked.
 */
export function hydrateOffer(row: unknown): Offer {
  const o = camelize<Offer & { offerPrices?: (OfferPrice & { sortOrder?: number })[] }>(row);
  return { ...o, prices: sortPrices(o.offerPrices ?? []) };
}

// Memoised per request: nearly every read in the app resolves the store first,
// so a single page render was asking for the same row a dozen times.
export const getStoreId = cache(async (): Promise<string> => {
  const db = createServiceClient();
  const { data, error } = await db
    .from("stores")
    .select("id")
    .eq("slug", STORE_SLUG)
    .single();
  if (error || !data) throw new Error(`store '${STORE_SLUG}' not found: ${error?.message}`);
  return data.id as string;
});

/**
 * The trading name, for anywhere a human reads it outside our own pages —
 * chiefly the Stripe charge description, which is what shows up on a card
 * statement. Read rather than hardcoded so renaming the store in settings
 * cannot leave old wording on new charges.
 */
export async function getStoreName(): Promise<string> {
  const db = createServiceClient();
  const { data } = await db.from("stores").select("name").eq("slug", STORE_SLUG).single();
  return (data?.name as string) || "Greater Inside";
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
  return data ? hydrateOffer(data) : null;
}

/** By its slug, for the offer's own public sales page at /o/[key]. */
export async function getOfferByKey(key: string): Promise<Offer | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("offers")
    .select(OFFER_COLUMNS)
    .eq("store_id", await getStoreId())
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`getOfferByKey: ${error.message}`);
  return data ? hydrateOffer(data) : null;
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
  return (data ?? []).map(hydrateOffer);
}

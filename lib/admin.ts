import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";
import { getStoreId } from "@/lib/store";
import type {
  Product,
  ProductStatus,
  Offer,
  GrantType,
  BillingType,
  Interval,
} from "@/lib/types";

// Admin-side reads/writes. Service-role; callers are admin server actions/pages.

const PRODUCT_COLUMNS =
  "id, slug, title, tagline, description, type, price_cents, compare_at_cents, currency, media_mode, media_path, media_embed_url, cover_image_url, cover_path, activecampaign_tag_id, status, bump_offer_id, upsell_offer_id, is_placeholder, sort_order";

const OFFER_COLUMNS =
  "id, key, name, grant_type, grant_product_id, grant_app_id, grant_entitlement_key, billing_type, interval, interval_count, trial_days, price_cents, compare_at_cents, currency, headline, description, bullets, image_url, accept_label, decline_label, active, activecampaign_tag_id, stripe_product_id_test, stripe_product_id_live";

export type OfferOption = {
  id: string;
  name: string;
  grantType: "product" | "subscription";
  priceCents: number;
  billingType: "one_time" | "recurring";
};

export type ProductInput = {
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  priceCents: number;
  compareAtCents: number | null;
  // media_mode / media_path / media_embed_url / cover_image_url are NOT here on
  // purpose. The product form has no inputs for them, and uploadPaidAsset owns
  // media_mode + media_path — letting a form save write them would null out an
  // uploaded asset. Saves leave those columns untouched.
  status: ProductStatus;
  bumpOfferId: string | null;
  upsellOfferId: string | null;
  activecampaignTagId: string | null;
};

export async function listAllProducts(): Promise<Product[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("store_id", await getStoreId())
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listAllProducts: ${error.message}`);
  return camelize<Product[]>(data ?? []);
}

export async function getProductById(id: string): Promise<Product | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("products").select(PRODUCT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getProductById: ${error.message}`);
  return data ? camelize<Product>(data) : null;
}

export async function listOfferOptions(): Promise<OfferOption[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("offers")
    .select("id, name, grant_type, price_cents, billing_type")
    .eq("store_id", await getStoreId())
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listOfferOptions: ${error.message}`);
  return camelize<OfferOption[]>(data ?? []);
}

// Map camelCase input -> snake_case row. Empty offer slots stored as null.
function toRow(input: ProductInput, storeId: string) {
  return {
    store_id: storeId,
    slug: input.slug,
    title: input.title,
    tagline: input.tagline,
    description: input.description,
    price_cents: input.priceCents,
    compare_at_cents: input.compareAtCents,
    status: input.status,
    bump_offer_id: input.bumpOfferId,
    upsell_offer_id: input.upsellOfferId,
    // Empty string means "no tag" — stored as null so the purchase path can
    // test for absence rather than for an empty string it would then have to
    // remember to trim.
    activecampaign_tag_id: input.activecampaignTagId?.trim() || null,
  };
}

export async function createProduct(input: ProductInput): Promise<string> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("products")
    .insert(toRow(input, await getStoreId()))
    .select("id")
    .single();
  if (error) throw new Error(`createProduct: ${error.message}`);
  return data.id as string;
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("products").update(toRow(input, await getStoreId())).eq("id", id);
  if (error) throw new Error(`updateProduct: ${error.message}`);
}

export async function deleteProduct(id: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("products").delete().eq("id", id);
  if (error) throw new Error(`deleteProduct: ${error.message}`);
}

// Upload a paid asset (PDF/audio) to the PRIVATE bucket and point the product
// at it. Never public — served later via ownership-checked signed URLs.
export async function uploadPaidAsset(productId: string, file: File): Promise<string> {
  const db = createServiceClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${productId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await db.storage.from("paid-assets").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (upErr) throw new Error(`uploadPaidAsset: ${upErr.message}`);
  const { error } = await db
    .from("products")
    .update({ media_path: path, media_mode: "upload" })
    .eq("id", productId);
  if (error) throw new Error(`uploadPaidAsset update: ${error.message}`);
  return path;
}

// ---------------------------------------------------------------------------
// Offer library CRUD.
// ---------------------------------------------------------------------------

export type OfferInput = {
  key: string;
  name: string;
  grantType: GrantType;
  grantProductId: string | null;
  grantAppId: string | null;
  grantEntitlementKey: string | null;
  billingType: BillingType;
  interval: Interval | null;
  intervalCount: number | null;
  trialDays: number | null;
  priceCents: number;
  compareAtCents: number | null;
  currency: string;
  headline: string;
  description: string | null;
  bullets: string[];
  imageUrl: string | null;
  acceptLabel: string;
  activecampaignTagId?: string | null;
  declineLabel: string;
  active: boolean;
};

export type ProductOption = { id: string; title: string };
export type AppOption = { id: string; key: string; name: string };

export async function listOffers(): Promise<Offer[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("offers")
    .select(OFFER_COLUMNS)
    .eq("store_id", await getStoreId())
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listOffers: ${error.message}`);
  return camelize<Offer[]>(data ?? []);
}

export async function getOfferById(id: string): Promise<Offer | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("offers").select(OFFER_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getOfferById: ${error.message}`);
  return data ? camelize<Offer>(data) : null;
}

export async function listProductOptions(): Promise<ProductOption[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("products")
    .select("id, title")
    .eq("store_id", await getStoreId())
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listProductOptions: ${error.message}`);
  return camelize<ProductOption[]>(data ?? []);
}

export async function listAppOptions(): Promise<AppOption[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("apps")
    .select("id, key, name")
    .eq("store_id", await getStoreId())
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listAppOptions: ${error.message}`);
  return camelize<AppOption[]>(data ?? []);
}

function toOfferRow(input: OfferInput, storeId: string) {
  return {
    store_id: storeId,
    key: input.key,
    name: input.name,
    grant_type: input.grantType,
    grant_product_id: input.grantType === "product" ? input.grantProductId : null,
    grant_app_id: input.grantType === "subscription" ? input.grantAppId : null,
    grant_entitlement_key: input.grantEntitlementKey,
    billing_type: input.billingType,
    interval: input.billingType === "recurring" ? input.interval : null,
    interval_count: input.billingType === "recurring" ? input.intervalCount : null,
    trial_days: input.billingType === "recurring" ? input.trialDays : null,
    price_cents: input.priceCents,
    compare_at_cents: input.compareAtCents,
    currency: input.currency,
    headline: input.headline,
    description: input.description,
    bullets: input.bullets,
    image_url: input.imageUrl,
    accept_label: input.acceptLabel,
    activecampaign_tag_id: input.activecampaignTagId ?? null,
    decline_label: input.declineLabel,
    active: input.active,
  };
}

export async function createOffer(input: OfferInput): Promise<string> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("offers")
    .insert(toOfferRow(input, await getStoreId()))
    .select("id")
    .single();
  if (error) throw new Error(`createOffer: ${error.message}`);
  return data.id as string;
}

export async function updateOffer(id: string, input: OfferInput): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("offers").update(toOfferRow(input, await getStoreId())).eq("id", id);
  if (error) throw new Error(`updateOffer: ${error.message}`);
}

export async function deleteOffer(id: string): Promise<void> {
  const db = createServiceClient();
  // Products referencing this offer have their slot set null (FK on delete set null).
  const { error } = await db.from("offers").delete().eq("id", id);
  if (error) throw new Error(`deleteOffer: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Store settings.
// ---------------------------------------------------------------------------

export type StoreSettings = {
  name: string;
  supportEmail: string | null;
  currency: string;
  /** Applied at checkout start, removed on payment. Drives the AC automation. */
  abandonedTagId: string | null;
};

export async function getStoreSettings(): Promise<StoreSettings> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("stores")
    .select("name, settings, activecampaign_abandoned_tag_id")
    .eq("id", await getStoreId())
    .single();
  if (error || !data) throw new Error(`getStoreSettings: ${error?.message}`);
  const settings = (data.settings ?? {}) as Record<string, string>;
  return {
    name: data.name as string,
    supportEmail: settings.support_email ?? null,
    currency: settings.currency ?? "usd",
    // A real column rather than a key in the settings json, because the
    // purchase path reads it on every checkout and a column can be indexed and
    // typed; the json blob is for things only the admin screen ever reads.
    abandonedTagId: (data.activecampaign_abandoned_tag_id as string) ?? null,
  };
}

export async function updateStoreSettings(input: StoreSettings): Promise<void> {
  const db = createServiceClient();
  const { error } = await db
    .from("stores")
    .update({
      name: input.name,
      settings: { support_email: input.supportEmail, currency: input.currency },
      activecampaign_abandoned_tag_id: input.abandonedTagId?.trim() || null,
    })
    .eq("id", await getStoreId());
  if (error) throw new Error(`updateStoreSettings: ${error.message}`);
}

// Storefront image for a single product, overriding whatever its course provides.
export async function setProductCover(productId: string, coverPath: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("products").update({ cover_path: coverPath }).eq("id", productId);
  if (error) throw new Error(`setProductCover: ${error.message}`);
}

export async function clearProductCover(productId: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("products").update({ cover_path: null }).eq("id", productId);
  if (error) throw new Error(`clearProductCover: ${error.message}`);
}

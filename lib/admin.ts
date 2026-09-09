import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { camelize } from "@/lib/case";
import { getStoreId, hydrateOffer, hydrateProduct, OFFER_COLUMNS, PRODUCT_COLUMNS } from "@/lib/store";
import { backfillStripeProduct } from "@/lib/stripe-catalog";
import { money } from "@/lib/money";
import { sortPrices, type OfferPrice } from "@/lib/offer-prices";
import type {
  Product,
  ProductStatus,
  Offer,
  GrantType,
  BillingType,
  Interval,
} from "@/lib/types";

// Admin-side reads/writes. Service-role; callers are admin server actions/pages.

// The one list, imported rather than copied. This file's copy had already
// drifted from the storefront's once; a second list of thirty columns cannot
// stay equal to the first, and the one that falls behind is the one nobody
// reads.


export type OfferOption = {
  id: string;
  name: string;
  grantType: "product" | "subscription";
  grantAppId: string | null;
  grantEntitlementKey: string | null;
  priceCents: number;
  currency: string;
  interval: string | null;
  /** So a bump can be described the way the buyer will read it: "$0 today". */
  trialDays: number | null;
  billingType: "one_time" | "recurring";
  /** Its ways to pay, so a placement can tick which of them to show. */
  prices: OfferPrice[];
  active: boolean;
};

export type ProductInput = {
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  /**
   * The headline price, and the mirror the trigger keeps.
   *
   * Still here because a save that carries no `prices` list — an import, a
   * script — must still produce a product with a price. Where `prices` IS
   * given it is the truth and this is overwritten from it.
   */
  priceCents: number;
  compareAtCents: number | null;
  /** Every way to buy this. The same model an offer's ways to pay use. */
  prices?: OfferPrice[];
  // media_mode / media_path / media_embed_url / cover_image_url are NOT here on
  // purpose. The product form has no inputs for them, and uploadPaidAsset owns
  // media_mode + media_path — letting a form save write them would null out an
  // uploaded asset. Saves leave those columns untouched.
  status: ProductStatus;
  bumpOfferId: string | null;
  upsellOfferId: string | null;
  bumpAltOfferId?: string | null;
  upsellAltOfferId?: string | null;
  bumpPriceIds?: string[];
  upsellPriceIds?: string[];
  activecampaignTagId: string | null;
  activecampaignAbandonedTagId: string | null;
  adEventName?: string | null;
  /** Overrides the title/name as Meta's content_name. Null keeps the old value. */
  contentName?: string | null;
  checkoutNote?: string | null;
  checkoutBullets?: string[];
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
  return (data ?? []).map(hydrateProduct);
}

export async function getProductById(id: string): Promise<Product | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("products").select(PRODUCT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getProductById: ${error.message}`);
  return data ? hydrateProduct(data) : null;
}

/**
 * Offers you can attach to something.
 *
 * Active only by default — the product form's bump and upsell pickers should
 * not offer a draft. `includeDrafts` is for the alternative-price picker,
 * where the second option is normally built beside the first and neither is
 * live yet; whether a buyer ever sees it is checked at render.
 */
export async function listOfferOptions(includeDrafts = false): Promise<OfferOption[]> {
  const db = createServiceClient();
  const q = db
    .from("offers")
    .select(
      // The prices come with it: the placement picker asks "which of this
      // offer's prices", and a second query per offer in a dropdown of twelve
      // is a round trip nobody would write on purpose.
      "id, name, grant_type, grant_app_id, grant_entitlement_key, price_cents, currency, interval, trial_days, billing_type, active, " +
        "offer_prices(id, label, billing_type, interval, interval_count, trial_days, price_cents, compare_at_cents, sort_order, archived)",
    )
    .eq("store_id", await getStoreId());
  const { data, error } = await (includeDrafts ? q : q.eq("active", true)).order("created_at", {
    ascending: true,
  });
  if (error) throw new Error(`listOfferOptions: ${error.message}`);
  // camelize turns offer_prices into offerPrices; the option calls it `prices`
  // because from a placement's point of view that is what they are.
  return (camelize<(OfferOption & { offerPrices?: OfferPrice[] })[]>(data ?? []) ?? []).map((o) => ({
    ...o,
    prices: sortPrices(o.offerPrices ?? []),
  }));
}

// Map camelCase input -> snake_case row. Empty offer slots stored as null.
function toRow(input: ProductInput, storeId: string) {
  return {
    store_id: storeId,
    slug: input.slug,
    title: input.title,
    tagline: input.tagline,
    description: input.description,
    // NOT written here any more where a price list exists: `products.price_cents`
    // is a mirror of the headline row, kept by the trigger in 0054, and a second
    // writer is how a cache starts disagreeing with itself. Kept for the update
    // path only so a product saved by something that has no list still has a
    // price — the trigger overwrites it the moment a row changes.
    price_cents: input.priceCents,
    compare_at_cents: input.compareAtCents,
    status: input.status,
    bump_offer_id: input.bumpOfferId,
    upsell_offer_id: input.upsellOfferId,
    bump_alt_offer_id: input.bumpAltOfferId ?? null,
    upsell_alt_offer_id: input.upsellAltOfferId ?? null,
    bump_price_ids: input.bumpPriceIds ?? [],
    upsell_price_ids: input.upsellPriceIds ?? [],
    // Empty string means "no tag" — stored as null so the purchase path can
    // test for absence rather than for an empty string it would then have to
    // remember to trim.
    activecampaign_tag_id: input.activecampaignTagId?.trim() || null,
    activecampaign_abandoned_tag_id: input.activecampaignAbandonedTagId?.trim() || null,
    ad_event_name: input.adEventName?.trim() || null,
    content_name: input.contentName?.trim() || null,
    checkout_note: input.checkoutNote?.trim() || null,
    // Blank lines dropped rather than stored: an empty bullet renders as a tick
    // beside nothing, which reads as a missing promise.
    checkout_bullets: (input.checkoutBullets ?? []).map((b) => b.trim()).filter(Boolean),
  };
}

export async function createProduct(input: ProductInput): Promise<string> {
  const db = createServiceClient();
  const first = input.prices?.[0];
  const { data, error } = await db
    .from("products")
    .insert({
      ...toRow(input, await getStoreId()),
      // A seed only. price_cents is NOT NULL and the trigger has nothing to
      // copy from until the first price row exists a moment from now.
      ...(first ? { price_cents: first.priceCents, compare_at_cents: first.compareAtCents } : {}),
    })
    .select("id")
    .single();
  if (error) throw new Error(`createProduct: ${error.message}`);
  if (input.prices?.length) await savePrices(data.id as string, input.prices, "product");
  // Give it a Stripe identity now rather than on its first sale, so it can be
  // picked in Stripe's "specific products" coupon restriction straight away.
  // Never blocks the save — see backfillStripeProduct.
  await backfillStripeProduct({ id: data.id as string, title: input.title });
  return data.id as string;
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("products").update(toRow(input, await getStoreId())).eq("id", id);
  if (error) throw new Error(`updateProduct: ${error.message}`);
  // After the row, so a save that fails its own validation has not already
  // rewritten the prices. savePrices refuses a reprice with live buyers and
  // throws, which the form reports.
  if (input.prices?.length) await savePrices(id, input.prices, "product");
  // Catches up anything that predates the Stripe catalogue. Idempotent: a
  // product that already has an id for this mode makes no Stripe call.
  const row = await getProductById(id);
  if (row) await backfillStripeProduct(row);
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
  /** Which channels inside the granted app. See lib/app-channels. */
  grantChannels?: string[];
  /** The ways to pay. Never empty — an offer with no price cannot be bought. */
  prices: OfferPrice[];
  currency: string;
  headline: string;
  description: string | null;
  bullets: string[];
  imageUrl: string | null;
  acceptLabel: string;
  pageAltOfferId?: string | null;
  /**
   * Validated in saveOffer (bumpSlotError) and written by toOfferRow below.
   * The offer form now posts this on every save (its picker defaults to the
   * current value), so — unlike when this comment warned the write was
   * missing — omitting it here would go back to nulling out a real value on
   * every unrelated save rather than preserving one nothing here changed.
   */
  bumpOfferId?: string | null;
  /** Validated in saveOffer (upsellSlotError) and written by toOfferRow below. */
  upsellOfferId?: string | null;
  activecampaignTagId?: string | null;
  adEventName?: string | null;
  /** Overrides the title/name as Meta's content_name. Null keeps the old value. */
  contentName?: string | null;
  activecampaignTrialTagId?: string | null;
  activecampaignCancelledTagId?: string | null;
  otoTemplate?: string;
  otoBody?: string | null;
  otoVideoUrl?: string | null;
  otoSections?: unknown;
  declineLabel: string;
  active: boolean;
};

export type ProductOption = { id: string; title: string; status: "draft" | "published" };
export type AppOption = {
  id: string;
  key: string;
  name: string;
  /** What this app can grant inside itself. Empty means it has no channels. */
  channels: string[];
};

export async function listOffers(): Promise<Offer[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("offers")
    .select(OFFER_COLUMNS)
    .eq("store_id", await getStoreId())
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listOffers: ${error.message}`);
  return (data ?? []).map(hydrateOffer);
}

export async function getOfferById(id: string): Promise<Offer | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("offers").select(OFFER_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getOfferById: ${error.message}`);
  return data ? hydrateOffer(data) : null;
}

export async function listProductOptions(): Promise<ProductOption[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("products")
    .select("id, title, status")
    .eq("store_id", await getStoreId())
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listProductOptions: ${error.message}`);
  return camelize<ProductOption[]>(data ?? []);
}

export async function listAppOptions(): Promise<AppOption[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("apps")
    .select("id, key, name, channels")
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
    grant_channels: input.grantChannels ?? [],
    // The price columns are NOT written here any more. They are a mirror of
    // the headline price, kept by offer_prices_sync, and a second writer of a
    // cache is how a cache starts disagreeing with itself. `savePrices` below
    // writes the prices; the trigger writes these.
    //
    // Except on INSERT, where they are NOT NULL and no price exists yet — see
    // createOffer, which seeds them from the first price and then lets the
    // trigger take over for ever.
    currency: input.currency,
    headline: input.headline,
    description: input.description,
    bullets: input.bullets,
    image_url: input.imageUrl,
    accept_label: input.acceptLabel,
    page_alt_offer_id: input.pageAltOfferId ?? null,
    bump_offer_id: input.bumpOfferId ?? null,
    upsell_offer_id: input.upsellOfferId ?? null,
    ad_event_name: input.adEventName?.trim() || null,
    content_name: input.contentName?.trim() || null,
    activecampaign_tag_id: input.activecampaignTagId ?? null,
    activecampaign_trial_tag_id: input.activecampaignTrialTagId ?? null,
    activecampaign_cancelled_tag_id: input.activecampaignCancelledTagId ?? null,
    oto_template: input.otoTemplate || "visual",
    oto_body: input.otoBody?.trim() || null,
    oto_video_url: input.otoVideoUrl?.trim() || null,
    oto_sections: input.otoSections ?? {},
    decline_label: input.declineLabel,
    active: input.active,
  };
}

export async function createOffer(input: OfferInput): Promise<string> {
  const db = createServiceClient();
  const first = input.prices[0];
  const { data, error } = await db
    .from("offers")
    .insert({
      ...toOfferRow(input, await getStoreId()),
      // Seed values only. They are NOT NULL and the trigger has nothing to
      // copy from until the first price row exists a moment from now.
      billing_type: first.billingType,
      interval: first.billingType === "recurring" ? first.interval : null,
      interval_count: first.intervalCount,
      trial_days: first.billingType === "recurring" ? first.trialDays : null,
      price_cents: first.priceCents,
      compare_at_cents: first.compareAtCents,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createOffer: ${error.message}`);
  await savePrices(data.id as string, input.prices);
  return data.id as string;
}

export async function updateOffer(id: string, input: OfferInput): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("offers").update(toOfferRow(input, await getStoreId())).eq("id", id);
  if (error) throw new Error(`updateOffer: ${error.message}`);
  await savePrices(id, input.prices);
}

/** How many people are on each price of this offer, and still paying. */
/**
 * Whose ways to pay these are.
 *
 * Offers had them first and products now have the same model, so both go
 * through the same two functions. A second copy of the reprice guard would be a
 * second place for it to be subtly weaker, and the weaker one is the one that
 * lets somebody's billing change underneath them.
 */
export type PriceOwner = "offer" | "product";

const TABLE = { offer: "offer_prices", product: "product_prices" } as const;
const OWNER_COL = { offer: "offer_id", product: "product_id" } as const;
const PRICE_COL = { offer: "offer_price_id", product: "product_price_id" } as const;

export async function priceUsage(
  ownerId: string,
  owner: PriceOwner = "offer",
): Promise<Record<string, number>> {
  const db = createServiceClient();
  // 'canceled' is deliberately excluded: those rows are kept and revived on a
  // re-purchase, and counting them would block archiving a price for ever.
  const { data, error } = await db
    .from("ownership")
    .select(PRICE_COL[owner])
    .eq(OWNER_COL[owner], ownerId)
    .in("status", ["active", "trialing", "past_due"])
    .not(PRICE_COL[owner], "is", null);
  if (error) throw new Error(`priceUsage: ${error.message}`);
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = (row as unknown as Record<string, string>)[PRICE_COL[owner]];
    if (id) out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

/**
 * Write the ways to pay, and refuse the two things that would hurt somebody.
 *
 * A price with live subscribers may be hidden but never repriced or removed.
 * Stripe holds each subscriber's price inline on their own subscription, so
 * neither actually changes what they pay — which is exactly why this has to be
 * refused rather than allowed: the admin would believe they had moved people
 * who had not moved, and the record of what somebody is on would be gone.
 *
 * `on delete restrict` on ownership is the half that holds when something
 * other than this function does the writing. This half is the one that can say
 * why.
 */
export async function savePrices(
  ownerId: string,
  prices: OfferPrice[],
  owner: PriceOwner = "offer",
): Promise<void> {
  const db = createServiceClient();
  const live = prices.filter((p) => !p.archived);
  if (live.length === 0) {
    throw new Error(`A ${owner} needs at least one way to pay that is showing.`);
  }

  const { data: existingRows, error: readErr } = await db
    .from(TABLE[owner])
    .select("id, billing_type, interval, interval_count, trial_days, price_cents")
    .eq(OWNER_COL[owner], ownerId);
  if (readErr) throw new Error(`savePrices: ${readErr.message}`);
  const existing = new Map((existingRows ?? []).map((r) => [r.id as string, r]));
  const usage = await priceUsage(ownerId, owner);

  const keep = new Set(prices.map((p) => p.id));
  for (const [id] of existing) {
    if (keep.has(id)) continue;
    if ((usage[id] ?? 0) > 0) {
      throw new Error(
        `${usage[id]} ${usage[id] === 1 ? "person is" : "people are"} on one of the prices you removed. Hide it instead — it stops being offered and nobody's billing changes.`,
      );
    }
    const { error } = await db.from(TABLE[owner]).delete().eq("id", id);
    if (error) throw new Error(`savePrices: ${error.message}`);
  }

  for (const [i, p] of prices.entries()) {
    const row = {
      [OWNER_COL[owner]]: ownerId,
      label: p.label.trim() || null,
      billing_type: p.billingType,
      interval: p.billingType === "recurring" ? p.interval : null,
      interval_count: Math.max(1, Math.round(p.intervalCount || 1)),
      trial_days: p.billingType === "recurring" ? p.trialDays : null,
      price_cents: p.priceCents,
      compare_at_cents: p.compareAtCents,
      sort_order: i,
      archived: p.archived,
    };
    const was = existing.get(p.id);
    if (was) {
      const moved =
        was.price_cents !== row.price_cents ||
        was.billing_type !== row.billing_type ||
        was.interval !== row.interval ||
        was.interval_count !== row.interval_count ||
        was.trial_days !== row.trial_days;
      if (moved && (usage[p.id] ?? 0) > 0) {
        throw new Error(
          `${usage[p.id]} ${usage[p.id] === 1 ? "person is" : "people are"} on ${money(was.price_cents as number)} — its terms cannot change. Add a new way to pay and hide this one.`,
        );
      }
      const { error } = await db.from(TABLE[owner]).update(row).eq("id", p.id);
      if (error) throw new Error(`savePrices: ${error.message}`);
    } else {
      // The id came from the browser, so it is a suggestion rather than a
      // fact — the database mints its own.
      const { error } = await db.from(TABLE[owner]).insert(row);
      if (error) throw new Error(`savePrices: ${error.message}`);
    }
  }
}

/**
 * Save copy overrides for the bespoke upsell page.
 *
 * Separate from updateOffer because it is a separate screen with a separate
 * form. Routing it through toOfferRow would mean the copy editor had to post
 * every pricing and grant field just to change a headline — and one missing
 * hidden input would silently rewrite the offer's price.
 */
/**
 * Change only the offer's public link.
 *
 * Its own function rather than a trip through updateOffer for the same reason
 * updateOfferPage and updateOfferBump are: this is a one-field form on a
 * different screen, and routing it through toOfferRow would make the link
 * editor post every pricing and grant field just to rename a URL — where one
 * missing hidden input silently rewrites the offer's price.
 *
 * The duplicate-key case is turned into a sentence here rather than left as a
 * Postgres constraint name, because it is the failure an admin will actually
 * hit: two offers cannot share an address.
 */
export async function updateOfferKey(id: string, key: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("offers").update({ key }).eq("id", id);
  if (!error) return;
  if (error.code === "23505") throw new Error("Another offer already uses that link.");
  throw new Error(`updateOfferKey: ${error.message}`);
}

export async function updateOfferPage(id: string, page: Record<string, string>): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("offers").update({ oto_page: page }).eq("id", id);
  if (error) throw new Error(`updateOfferPage: ${error.message}`);
}

/**
 * Save the order bump's presentation.
 *
 * Separate from updateOffer for the same reason updateOfferPage is: this is its
 * own screen with its own form, and routing it through toOfferRow would make
 * the bump editor post every pricing and grant field just to change a bullet —
 * where one missing hidden input silently rewrites the offer's price.
 */
export async function updateOfferBump(
  id: string,
  input: {
    bumpHeadline: string | null;
    bumpDescription: string | null;
    bumpBanner: string;
    bumpBullets: string[];
    bumpNote: string | null;
    bumpAccent: string;
  },
): Promise<void> {
  const db = createServiceClient();
  const { error } = await db
    .from("offers")
    .update({
      bump_headline: input.bumpHeadline,
      bump_description: input.bumpDescription,
      bump_banner: input.bumpBanner,
      bump_bullets: input.bumpBullets,
      bump_note: input.bumpNote,
      bump_accent: input.bumpAccent,
    })
    .eq("id", id);
  if (error) throw new Error(`updateOfferBump: ${error.message}`);
}

export async function deleteOffer(id: string): Promise<void> {
  const db = createServiceClient();
  // Products referencing this offer have their slot set null (FK on delete set null).
  const { error } = await db.from("offers").delete().eq("id", id);
  if (error) throw new Error(`deleteOffer: ${error.message}`);
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

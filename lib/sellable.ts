import type { Offer, Product } from "@/lib/types";
import type { OfferPrice } from "@/lib/offer-prices";

/**
 * A thing a placement can sell, whichever table it came from.
 *
 * This is the seam that lets a bump or an upsell name a product without any of
 * the code beneath it learning a second shape. `buildBumpView` already takes a
 * structural type rather than an `Offer`, so a product adapted into that shape
 * renders through the very same view — no second renderer, no second set of
 * copy defaults, nothing to drift.
 *
 * What it deliberately does NOT do is invent an offer row. A synthetic offer
 * would need an id, that id would be written onto `ownership.offer_id`, and it
 * would point at nothing. `offer_id` is nullable precisely because a grant can
 * come from somewhere else; a product-backed placement uses that rather than
 * lying about where it came from.
 *
 * See docs/products-and-offers.md — this is slice 1, and the shape below is
 * what a "pitch" will eventually point at.
 */
export type Sellable = {
  kind: "offer" | "product";
  /** The row this came from. Written to order_items and ownership. */
  id: string;
  /** For the dashboard, the receipt and the CRM — never shown to a buyer. */
  name: string;
  currency: string;
  /** Every way to buy it, before a placement narrows them down. */
  prices: OfferPrice[];
  /** What owning it grants. A product grants itself; an offer says. */
  grant:
    | { type: "product"; productId: string }
    | { type: "app"; appId: string; entitlementKey: string | null };
  /** The Stripe Product recurring prices bill against, once resolved. */
  stripeProductIdTest: string | null;
  stripeProductIdLive: string | null;
  /** The copy a bump draws. A product has none of its own and takes the defaults. */
  headline: string;
  description: string | null;
  bumpHeadline: string | null;
  bumpDescription: string | null;
  bumpBanner: string | null;
  bumpBullets: string[] | null;
  bumpNote: string | null;
  bumpAccent: string | null;
};

export function sellableFromOffer(offer: Offer): Sellable {
  return {
    kind: "offer",
    id: offer.id,
    name: offer.name,
    currency: offer.currency,
    prices: offer.prices,
    grant:
      offer.grantType === "subscription" && offer.grantAppId
        ? { type: "app", appId: offer.grantAppId, entitlementKey: offer.grantEntitlementKey ?? null }
        : { type: "product", productId: offer.grantProductId as string },
    stripeProductIdTest: offer.stripeProductIdTest ?? null,
    stripeProductIdLive: offer.stripeProductIdLive ?? null,
    headline: offer.headline,
    description: offer.description,
    bumpHeadline: offer.bumpHeadline,
    bumpDescription: offer.bumpDescription,
    bumpBanner: offer.bumpBanner,
    bumpBullets: offer.bumpBullets,
    bumpNote: offer.bumpNote,
    bumpAccent: offer.bumpAccent,
  };
}

/**
 * A product, as something a placement can sell.
 *
 * The bump copy is all null, which is the point: every one of those fields
 * already falls back to a sensible default built from the price and the terms,
 * so a product-backed bump reads correctly the moment it is chosen and has no
 * copy to fill in before it works.
 *
 * Its title carries the headline. A product has no separate "headline" the way
 * an offer does — the title IS what it is called, everywhere else it appears.
 */
export function sellableFromProduct(product: Product): Sellable {
  return {
    kind: "product",
    id: product.id,
    name: product.title,
    currency: product.currency,
    prices: product.prices ?? [],
    grant: { type: "product", productId: product.id },
    stripeProductIdTest: product.stripeProductIdTest ?? null,
    stripeProductIdLive: product.stripeProductIdLive ?? null,
    headline: product.title,
    description: product.tagline,
    bumpHeadline: null,
    bumpDescription: null,
    bumpBanner: null,
    bumpBullets: null,
    bumpNote: null,
    bumpAccent: null,
  };
}

/**
 * The sellable at one of its prices, flattened for the view and the charge.
 *
 * The same trick `offerAtPrice` plays for offers: everything downstream reads
 * scalar billing fields, so the chosen price is merged over the thing rather
 * than threaded alongside it as a second argument nobody can forget to pass.
 */
export function sellableAtPrice(s: Sellable, price: OfferPrice) {
  return {
    ...s,
    billingType: price.billingType,
    interval: price.interval,
    intervalCount: price.intervalCount,
    trialDays: price.trialDays,
    priceCents: price.priceCents,
    compareAtCents: price.compareAtCents,
    priceId: price.id,
  };
}

export type PricedSellable = ReturnType<typeof sellableAtPrice>;

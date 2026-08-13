import type { OfferPrice } from "@/lib/offer-prices";
// camelCase domain types (API boundary). DB is snake_case; see lib/case.ts.
export type ProductType = "pdf" | "audio" | "video" | "app" | "course";
export type MediaMode = "upload" | "embed";
export type ProductStatus = "draft" | "published";

export type Product = {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  // Legacy: the storefront badge now comes from the product's course, not this.
  // Nullable since products are saved without it.
  type: ProductType | null;
  priceCents: number;
  compareAtCents: number | null;
  currency: string;
  mediaMode: MediaMode | null;
  mediaPath: string | null;
  mediaEmbedUrl: string | null;
  coverImageUrl: string | null;
  /** Optional storefront image for THIS product; overrides the course cover. */
  coverPath: string | null;
  /** ActiveCampaign tag applied to the buyer on purchase. Null = no tag. */
  activecampaignTagId: string | null;
  /** Applied when checkout for this product starts; removed when it is paid. */
  activecampaignAbandonedTagId: string | null;
  status: ProductStatus;
  bumpOfferId: string | null;
  upsellOfferId: string | null;
  /**
   * A second price beside each, shown on THIS product's checkout.
   *
   * On the placement rather than the offer: the same offer may want both
   * prices in one product's bump and only the monthly in another's, and a
   * product form that does not say which is a form nobody can read.
   */
  /**
   * The second OFFER a placement pairs with. Superseded by the price lists
   * below and kept only while placements are being moved across — an empty
   * price list falls through to this, so nothing that works today stops.
   */
  bumpAltOfferId: string | null;
  upsellAltOfferId: string | null;
  /** Which of the bump offer's prices this checkout shows. Empty = the headline one. */
  bumpPriceIds: string[];
  upsellPriceIds: string[];
  isPlaceholder: boolean;
  sortOrder: number;
  /** A line under the tagline on the checkout. Null falls back to nothing. */
  checkoutNote: string | null;
  /** Replaces the checkout's reassurance list. Empty falls back to the defaults. */
  checkoutBullets: string[];
};

export type GrantType = "product" | "subscription";
export type BillingType = "one_time" | "recurring";
export type Interval = "day" | "week" | "month" | "year";

export type Offer = {
  id: string;
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
  /**
   * The BUYER tag: applied the first time money is taken, removed at
   * cancellation. On a trial offer that is when the trial converts, not when
   * it starts — see lifecycleTagOps.
   */
  activecampaignTagId: string | null;
  /**
   * A second price on this offer's OWN page at /o/<key>.
   *
   * Bumps and upsells read their pairing from the product that places them —
   * the same offer may be two prices there and one price elsewhere. This page
   * has no product behind it, so it carries its own.
   */
  pageAltOfferId: string | null;
  /**
   * The ways to pay for this. Never empty once 0048 has run.
   *
   * The scalar price fields above are a MIRROR of the first non-archived one,
   * kept by a database trigger. They stay because sixty readers want "the
   * headline price" and that is exactly what they are — see offerAtPrice for
   * how a reader asks about a different one.
   */
  prices: OfferPrice[];
  /** Which of its own prices the offer's page shows. Empty = the headline one. */
  pagePriceIds: string[];
  /** Applied when a trial starts. Kept if they cancel before ever paying. */
  activecampaignTrialTagId: string | null;
  /** Applied when access ends. Never removed. */
  activecampaignCancelledTagId: string | null;
  /** Checkout-bump copy. Null falls back to headline/description. */
  bumpHeadline: string | null;
  bumpDescription: string | null;
  /** Bump presentation. See lib/bump.ts — null banner means "show the default". */
  bumpBanner: string | null;
  bumpBullets: string[] | null;
  bumpNote: string | null;
  bumpAccent: string | null;
  /** Which layout renders this offer's upsell page. */
  otoTemplate: string;
  /** Long-form copy for the `long` template. */
  otoBody: string | null;
  /** Embed URL for the hero; falls back to imageUrl. */
  otoVideoUrl: string | null;
  /** Long-form sales page sections. Empty sections are skipped. */
  otoSections: unknown;
  /** Copy overrides for a bespoke upsell page. See lib/oto-content.ts. */
  otoPage: unknown;
  declineLabel: string;
  active: boolean;
  stripeProductIdTest: string | null;
  stripeProductIdLive: string | null;
};

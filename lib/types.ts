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
  /**
   * The headline price, mirrored from the first non-archived row in `prices`.
   *
   * A cache, not a fact — written by the database trigger in 0054 and by
   * nothing else. Read it for a card or a summary; charge from `prices`.
   */
  priceCents: number;
  compareAtCents: number | null;
  /** Every way to buy this, in the order the editor put them in. */
  prices: OfferPrice[];
  /**
   * The Stripe Product this product's recurring prices bill against.
   *
   * Two, because test and live are separate object spaces in Stripe and a test
   * id sent to the live API is a 404 at the moment of a real purchase. Written
   * on first use — see ensureStripeProductForProduct.
   */
  stripeProductIdTest?: string | null;
  stripeProductIdLive?: string | null;
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
  /** Meta custom event fired on this funnel's upsell page. Ads team's name. */
  adEventName?: string | null;
  /** Overrides the title/name as Meta's content_name. Null keeps the old value. */
  contentName?: string | null;
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
  /**
   * The offer whose ways to pay this product is sold on.
   *
   * Null means its own one-time price, which is every product today. Naming one
   * is what lets a product be offered monthly — the base charge still goes
   * through the product's price until the checkout learns to route it.
   */
  offerId: string | null;
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
  /**
   * Which channels inside the granted app this offer unlocks.
   *
   * Empty on anything that does not grant an app — a product or a course has
   * no channels — and empty is also what an app-granting offer looks like
   * before anybody has chosen, which the editor treats as "not decided yet"
   * rather than as "none". Sent to the app on every provision call.
   */
  grantChannels: string[];
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
  /** Meta custom event fired when this offer is bought. Ads team's name. */
  adEventName?: string | null;
  /** Overrides the title/name as Meta's content_name. Null keeps the old value. */
  contentName?: string | null;
  /** Position on the storefront. Null means it is not shown there; 1 is first. */
  homeOrder?: number | null;
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
  /**
   * When the row last changed.
   *
   * Read so the admin form can key its remount on it. The form is
   * uncontrolled — every field is `defaultValue`, which React ignores on
   * re-render — so without a key that moves, a save that CORRECTED the input
   * leaves the corrected field showing what was typed instead of what was
   * stored, and nothing says so.
   */
  updatedAt: string;
  /** An offer shown as a tickbox on this offer's checkout. */
  bumpOfferId: string | null;
  /** Which of the bump offer's prices this placement shows. Empty = headline. */
  bumpPriceIds: string[];
  /**
   * The one-time-offer page shown after THIS offer's own checkout.
   *
   * Unlike bumpOfferId, may be a recurring offer — see upsellSlotError. There
   * is no `upsellPriceIds` selector on this offer's own form (offer-form.tsx
   * mirrors the bump picker, which has none either): the placement always
   * shows the upsell's headline price, same as a product's slot does before
   * an admin ticks specific prices for it.
   */
  upsellOfferId: string | null;
  /** Which of the upsell offer's prices this placement shows. Empty = headline. */
  upsellPriceIds: string[];
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

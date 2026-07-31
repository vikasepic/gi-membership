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
  status: ProductStatus;
  bumpOfferId: string | null;
  upsellOfferId: string | null;
  isPlaceholder: boolean;
  sortOrder: number;
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
  declineLabel: string;
  active: boolean;
  stripeProductIdTest: string | null;
  stripeProductIdLive: string | null;
};

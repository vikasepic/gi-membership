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
  type: ProductType;
  priceCents: number;
  compareAtCents: number | null;
  currency: string;
  mediaMode: MediaMode | null;
  mediaPath: string | null;
  mediaEmbedUrl: string | null;
  coverImageUrl: string | null;
  status: ProductStatus;
  bumpOfferId: string | null;
  upsellOfferId: string | null;
  isPlaceholder: boolean;
  sortOrder: number;
  chapterLabel: string;
  lessonLabel: string;
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

import type { BumpView } from "@/lib/bump";
export type { BumpChoice } from "@/lib/bump";

/**
 * The small shared things the checkout's pieces all need.
 *
 * Extracted from checkout-form.tsx when the page became blocks: the form
 * imports the pieces and the pieces need the country list and the product
 * shape, which would have been a cycle. A module with no imports of its own
 * cannot be part of one.
 */

/**
 * The bump's shape is BumpView, built by lib/bump.ts so the checkout and the
 * admin preview cannot diverge. Kept as an alias because several call sites and
 * tests refer to it by the old name.
 */
export type BumpSummary = BumpView;

export type CheckoutProduct = {
  slug: string;
  title: string;
  tagline: string | null;
  priceCents: number;
  currency: string;
  /** Cover thumbnail — the buyer should see what they're paying for. */
  coverUrl?: string | null;
};

// Mirrors MIN_CHARGE_CENTS in lib/coupons.ts, which is server-only and cannot
// be imported here. Display only — the server enforces the real floor.
export const MIN_CHARGE_CENTS_CLIENT = 50;

// Buyer country drives the VAT rate. Common markets first, then the rest of the
// EU/UK where digital-services VAT applies at the buyer's rate.
export const COUNTRIES = [
  { code: "US", name: "United States" }, { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" }, { code: "AU", name: "Australia" },
  { code: "IN", name: "India" }, { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" }, { code: "FR", name: "France" },
  { code: "ES", name: "Spain" }, { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" }, { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" }, { code: "PT", name: "Portugal" },
  { code: "SE", name: "Sweden" }, { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" }, { code: "PL", name: "Poland" },
  { code: "NO", name: "Norway" }, { code: "CH", name: "Switzerland" },
  { code: "NZ", name: "New Zealand" }, { code: "SG", name: "Singapore" },
  { code: "AE", name: "United Arab Emirates" }, { code: "ZA", name: "South Africa" },
];

import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";

/**
 * The last hop of the reassurance list: the checkout page handing it to the panel.
 *
 * `app/admin/checkout-bullets.test.tsx` covers the form, the action and the
 * panel, but it wires the panel by hand — so the one real join in the app,
 * `bullets={product.checkoutBullets}` in this page, was the single step nothing
 * touched. Deleting that line left the whole suite green and every seller's
 * list off every checkout.
 *
 * The page is an async server component, so it is CALLED rather than rendered:
 * awaiting it gives the element tree, and the props of the `CheckoutPanel` in
 * that tree are what this asserts. Rendering would drag in `CheckoutForm` and
 * Stripe for a question about one prop.
 */

const PRODUCT = {
  id: "prod-1",
  slug: "product-validator",
  title: "Product Validator",
  tagline: "Know before you build.",
  status: "published",
  coverPath: null,
  bumpOfferId: null,
  bumpAltOfferId: null,
  checkoutNote: "Instant access.",
  checkoutBullets: ["Written for founders.", "Two hours, not two weeks."],
};

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
}));
vi.mock("@/lib/store", () => ({
  getProductBySlug: async () => PRODUCT,
  getOffer: async () => null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
  createServiceClient: () => {
    throw new Error("no signed-in user, so nothing here should read orders");
  },
}));
vi.mock("@/lib/offers", () => ({ shouldShowOffer: () => false }));
vi.mock("@/lib/checkout", () => ({ ownershipFor: async () => ({ productIds: new Set(), appIds: new Set() }) }));
vi.mock("@/lib/env", () => ({ stripePublishableKey: () => "pk_test_x" }));
vi.mock("@/lib/bump", () => ({ buildBumpView: () => null }));
vi.mock("@/lib/trial-history", () => ({ offerAsSoldTo: async () => null }));
vi.mock("@/lib/media", () => ({ publicCoverUrl: () => null }));
vi.mock("@/lib/courses", () => ({ productDisplay: async () => new Map() }));
vi.mock("@/lib/leads", () => ({ rememberLead: async () => {} }));
vi.mock("@/lib/settings", () => ({ getSettingsOrDefaults: async () => ({ replyTime: "one working day" }) }));
vi.mock("@/lib/legal", () => ({ legalFrom: () => ({ refundWindowDays: 14 }) }));

const { default: CheckoutPage } = await import("@/app/(store)/checkout/page");
const { CheckoutPanel } = await import("@/components/checkout/checkout-panel");

/** The first element in the tree rendered by `type`, with its props. */
function find(node: unknown, type: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, type);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as ReactElement<Record<string, unknown>>;
  if (el.type === type) return el.props;
  return el.props ? find((el.props as { children?: unknown }).children, type) : null;
}

describe("what the checkout page hands the panel", () => {
  it("passes the seller's own lines, not the standard ones", async () => {
    const tree = await CheckoutPage({ searchParams: Promise.resolve({ product: PRODUCT.slug }) });
    const props = find(tree, CheckoutPanel);
    expect(props).toBeTruthy();
    expect(props!.bullets).toEqual(PRODUCT.checkoutBullets);
    // The note travels the same way and had the same gap.
    expect(props!.note).toBe(PRODUCT.checkoutNote);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The product checkout while an admin views the store as a member (owner,
 * 4 Nov 2026: "if I am in view as then I must see everything as the person").
 *
 * It shows what the MEMBER would see: their ownership decides the page. And it
 * writes nothing for them: an admin looking is not the member starting a
 * checkout, so no lead is recorded that could send them a follow-up. Paying is
 * refused separately, by the checkout actions.
 */
const PRODUCT = {
  id: "prod-1",
  slug: "product-validator",
  title: "Product Validator",
  tagline: "",
  status: "published",
  coverPath: null,
  bumpOfferId: null,
  bumpAltOfferId: null,
  checkoutNote: null,
  checkoutBullets: [],
};
const who = vi.hoisted(() => ({ viewer: null as null | { id: string; email: string; viewingAs: boolean } }));
const ownershipFor = vi.hoisted(() => vi.fn(async () => ({ productIds: new Set<string>(), appIds: new Set<string>(), appChannels: new Map() })));
const rememberLead = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("@/lib/view-as", () => ({
  viewer: async () => (who.viewer ? { ...who.viewer, actingAdminId: who.viewer.viewingAs ? "admin-1" : null, name: null } : null),
}));
vi.mock("@/lib/store", () => ({ getProductBySlug: async () => PRODUCT, getOffer: async () => null, getStoreId: async () => "store-1" }));
vi.mock("@/lib/supabase/server", () => ({
  // The admin actually signed in. The page must not read it.
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "admin-1", email: "admin@x.test" } } }) } }),
  createServiceClient: () => {
    const q: Record<string, unknown> = {};
    for (const m of ["from", "select", "eq", "order", "limit", "not"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: null, error: null });
    return q;
  },
}));
vi.mock("@/lib/offers", () => ({ shouldShowOffer: () => false }));
vi.mock("@/lib/checkout", () => ({ ownershipFor }));
vi.mock("@/lib/env", () => ({ stripePublishableKey: () => "pk_test_x" }));
vi.mock("@/lib/bump", () => ({ buildBumpView: () => null }));
vi.mock("@/lib/trial-history", () => ({ offerAsSoldTo: async () => null }));
vi.mock("@/lib/media", () => ({ publicCoverUrl: () => null }));
vi.mock("@/lib/courses", () => ({ productDisplay: async () => new Map() }));
vi.mock("@/lib/leads", () => ({ rememberLead }));
vi.mock("@/lib/settings", () => ({ getSettingsOrDefaults: async () => ({ replyTime: "one working day" }) }));
vi.mock("@/lib/legal", () => ({ legalFrom: () => ({ refundWindowDays: 14 }) }));
vi.mock("@/lib/pages", () => ({ getPageSections: async () => [] }));
vi.mock("@/lib/traffic", () => ({ recordPageHit: async () => {} }));
vi.mock("@/lib/visits", () => ({ recordVisitStep: async () => {} }));

const { default: CheckoutPage } = await import("@/app/(store)/checkout/page");
const open = () => CheckoutPage({ searchParams: Promise.resolve({ product: PRODUCT.slug }) });

beforeEach(() => {
  ownershipFor.mockClear();
  rememberLead.mockClear();
});

describe("the product checkout, viewed as a member", () => {
  it("decides the page by the member's ownership, not the admin's", async () => {
    who.viewer = { id: "member-1", email: "hardy@x.test", viewingAs: true };
    await open();
    expect(ownershipFor).toHaveBeenCalledWith("member-1");
    expect(ownershipFor).not.toHaveBeenCalledWith("admin-1");
  });

  it("records no lead for the member", async () => {
    who.viewer = { id: "member-1", email: "hardy@x.test", viewingAs: true };
    await open();
    expect(rememberLead).not.toHaveBeenCalled();
  });

  it("still records the lead for someone checking out as themselves", async () => {
    who.viewer = { id: "member-1", email: "hardy@x.test", viewingAs: false };
    await open();
    expect(rememberLead).toHaveBeenCalledWith({ visitorKey: "member-1", productId: PRODUCT.id, email: "hardy@x.test" });
  });
});

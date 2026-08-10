import { describe, it, expect, afterAll } from "vitest";
import { createProduct, updateProduct, getProductById } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * The copy beside the card fields, per product.
 *
 * A new products column has to be added to THREE separate PRODUCT_COLUMNS
 * lists — lib/admin.ts, lib/store.ts and lib/library.ts. Miss one and the
 * value is silently null on that surface only, which is exactly the kind of
 * bug that reaches production looking like "the checkout ignores my text".
 * This reads it back through the admin path and the storefront path.
 */
const base = {
  slug: `checkout-copy-${Date.now()}`,
  title: "Copy test",
  tagline: null,
  description: null,
  priceCents: 500,
  compareAtCents: null,
  status: "draft" as const,
  bumpOfferId: null,
  upsellOfferId: null,
  activecampaignTagId: null,
  activecampaignAbandonedTagId: null,
};

let id: string | null = null;
afterAll(async () => {
  if (!canRun || !id) return;
  await createServiceClient().from("products").delete().eq("id", id);
});

describe.skipIf(!canRun)("checkout copy on a product", () => {
  it("stores a note and a list", async () => {
    id = await createProduct({
      ...base,
      checkoutNote: "Delivered as a PDF you keep.",
      checkoutBullets: ["One", "Two"],
    });
    const p = await getProductById(id);
    expect(p?.checkoutNote).toBe("Delivered as a PDF you keep.");
    expect(p?.checkoutBullets).toEqual(["One", "Two"]);
  });

  it("reads the same values through the storefront's column list", async () => {
    // The bug this catches: a column added to the admin's list and not the
    // store's reads fine in the editor and is null on the page that sells.
    const { getProductBySlug } = await import("@/lib/store");
    const p = await getProductBySlug(base.slug);
    expect(p?.checkoutNote).toBe("Delivered as a PDF you keep.");
    expect(p?.checkoutBullets).toEqual(["One", "Two"]);
  });

  it("drops blank lines rather than storing them", async () => {
    // An empty bullet renders as a tick beside nothing, which reads as a
    // promise that failed to load.
    await updateProduct(id!, { ...base, checkoutBullets: ["Kept", "   ", ""] });
    expect((await getProductById(id!))?.checkoutBullets).toEqual(["Kept"]);
  });

  it("treats an empty note as none at all", async () => {
    await updateProduct(id!, { ...base, checkoutNote: "   ", checkoutBullets: [] });
    const p = await getProductById(id!);
    expect(p?.checkoutNote).toBeNull();
    expect(p?.checkoutBullets).toEqual([]);
  });
});

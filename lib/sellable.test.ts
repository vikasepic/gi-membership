import { describe, it, expect } from "vitest";
import { sellableFromProduct, sellableAtPrice } from "@/lib/sellable";
import { buildBumpView } from "@/lib/bump";
import { newOfferPrice } from "@/lib/offer-prices";
import type { Product } from "@/lib/types";

const price = (over: Partial<ReturnType<typeof newOfferPrice>> = {}) => ({
  ...newOfferPrice("p1"),
  billingType: "one_time" as const,
  priceCents: 1900,
  ...over,
});

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: "prod-1",
    title: "The Idea Vault",
    tagline: "A hundred ideas, sorted.",
    currency: "usd",
    priceCents: 1900,
    compareAtCents: null,
    prices: [price()],
    status: "published",
    ...over,
  }) as unknown as Product;

/**
 * A product, sold from somebody else's checkout.
 *
 * The point of the adapter is that nothing downstream learns a second shape.
 * If these pass, a product-backed bump renders through the very same view an
 * offer does — same copy defaults, same terms line, same badge.
 */
describe("a product can be sold as a placement", () => {
  it("renders through the same bump view an offer uses", () => {
    const v = buildBumpView(sellableAtPrice(sellableFromProduct(product()), price()));
    expect(v.headline).toBe("The Idea Vault");
    expect(v.nowLabel).toBe("$19");
  });

  it("takes the built-in copy, because a product has none of its own", () => {
    // Every bump field falls back to something built from the price and the
    // terms, so a product-backed bump reads correctly the moment it is chosen
    // and has no copy to fill in before it works.
    const v = buildBumpView(sellableAtPrice(sellableFromProduct(product()), price()));
    expect(v.banner).toBeTruthy();
    expect(v.description).toBe("A hundred ideas, sorted.");
  });

  it("carries a trial through to the terms, the same as an offer", () => {
    const monthly = price({
      billingType: "recurring",
      interval: "month",
      trialDays: 7,
      priceCents: 900,
    });
    const v = buildBumpView(
      sellableAtPrice(sellableFromProduct(product({ prices: [monthly] })), monthly),
    );
    // Nothing today, and the real terms stated beside it.
    expect(v.nowLabel).toBe("$0");
    expect(v.planLabel).toContain("$9");
  });

  it("grants itself", () => {
    // An offer says what it grants; a product IS what it grants.
    expect(sellableFromProduct(product()).grant).toEqual({ type: "product", productId: "prod-1" });
  });

  it("invents no offer id", () => {
    // A synthetic offer id would be written onto ownership.offer_id and point
    // at nothing. The column is nullable precisely so a grant can come from
    // somewhere else.
    const s = sellableFromProduct(product());
    expect(s.kind).toBe("product");
    expect(s.id).toBe("prod-1");
  });
});

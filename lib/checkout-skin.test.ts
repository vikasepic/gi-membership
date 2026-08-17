import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { checkoutSkin, withSkin, DEFAULT_SKIN } from "@/lib/checkout-skin";

describe("which checkout a visitor gets", () => {
  it("is the shipped one unless the redesign is asked for by name", () => {
    // The whole safety of putting an unapproved checkout on the live site rests
    // on this: anything that is not the exact opt-in is the checkout the store
    // is already selling on.
    for (const raw of [undefined, "", "v1", "V3", "new", "true", "1", "v2x", "xv2"]) {
      expect(checkoutSkin(raw)).toBe("v1");
    }
  });

  it("takes v2, however it was typed", () => {
    expect(checkoutSkin("v2")).toBe("v2");
    expect(checkoutSkin("V2")).toBe("v2");
    expect(checkoutSkin(" v2 ")).toBe("v2");
    // Next hands a repeated query parameter through as an array.
    expect(checkoutSkin(["v2", "v1"])).toBe("v2");
  });

  it("ships defaulting to the old checkout", () => {
    // The line somebody flips on approval. Asserted so that flipping it is a
    // deliberate act with a failing test attached, not a silent launch.
    expect(DEFAULT_SKIN).toBe("v1");
  });

  it("carries the choice across a link without doubling the question mark", () => {
    expect(withSkin("/checkout?product=a", "v2")).toBe("/checkout?product=a&skin=v2");
    expect(withSkin("/library", "v2")).toBe("/library?skin=v2");
    expect(withSkin("/library", "v1")).toBe("/library");
  });
});

describe("what the redesign is allowed to change", () => {
  const productPage = readFileSync("app/(store)/checkout/page.tsx", "utf8");
  const offerPage = readFileSync("app/(store)/checkout/offer/page.tsx", "utf8");

  it("does not fork the money path", () => {
    // The reason this is a skin and not a second route. Two places creating
    // intents is two places to fix a pricing bug in, and one of them forgotten.
    expect(productPage.split("<CheckoutForm").length - 1).toBe(1);
    expect(offerPage.split("<OfferCheckoutForm").length - 1).toBe(1);
  });

  it("hands both checkouts the same skin it resolved", () => {
    expect(productPage).toContain("skin={skin}");
    expect(offerPage).toContain("skin={skin}");
  });
});

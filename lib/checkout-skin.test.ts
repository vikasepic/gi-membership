import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { checkoutSkin, withSkin, DEFAULT_SKIN } from "@/lib/checkout-skin";

describe("which checkout a visitor gets", () => {
  it("is the redesign unless something else is asked for by name", () => {
    // Nothing but an exact, known name changes the answer — a typo must land
    // on a working checkout rather than on neither.
    for (const raw of [undefined, "", "V3", "new", "true", "1", "v2x", "xv2", "old"]) {
      expect(checkoutSkin(raw)).toBe("v2");
    }
  });

  it("keeps the old checkout reachable by name", () => {
    // The way back. If the redesign goes wrong on a live sale the fix is a
    // link, not a deploy — so this staying true matters more now that it is
    // the fallback rather than the default.
    expect(checkoutSkin("v1")).toBe("v1");
    expect(checkoutSkin("V1")).toBe("v1");
    expect(checkoutSkin([" v1 "])).toBe("v1");
  });

  it("takes v2, however it was typed", () => {
    expect(checkoutSkin("v2")).toBe("v2");
    expect(checkoutSkin("V2")).toBe("v2");
    expect(checkoutSkin(" v2 ")).toBe("v2");
    // Next hands a repeated query parameter through as an array.
    expect(checkoutSkin(["v2", "v1"])).toBe("v2");
  });

  it("ships defaulting to the redesign", () => {
    // Flipped on approval, 17 Aug 2026. Asserted in both directions over its
    // life so that changing which checkout a buyer meets is always a deliberate
    // act with a failing test attached, never a silent launch.
    expect(DEFAULT_SKIN).toBe("v2");
  });

  it("carries the choice across a link without doubling the question mark", () => {
    expect(withSkin("/checkout?product=a", "v1")).toBe("/checkout?product=a&skin=v1");
    expect(withSkin("/library", "v1")).toBe("/library?skin=v1");
    // The default needs no saying.
    expect(withSkin("/library", "v2")).toBe("/library");
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

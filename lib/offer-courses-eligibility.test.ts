import { describe, it, expect } from "vitest";
import { isOfferEligible } from "@/lib/offers";

/** A courses-only offer has no product or app to compare, so the offer itself decides (0095). */
describe("whether a courses-only offer may be sold", () => {
  const owned = (offerIds: string[] = []) => ({
    productIds: new Set<string>(),
    appIds: new Set<string>(),
    appChannels: new Map<string, Set<string>>(),
    offerIds: new Set(offerIds),
  });
  const offer = { id: "offer-1", grantType: "course" as const, grantProductId: null, grantAppId: null };

  it("is sold to someone who does not hold it", () => {
    expect(isOfferEligible(offer, owned())).toBe(true);
  });

  it("is not sold twice", () => {
    expect(isOfferEligible(offer, owned(["offer-1"]))).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { isOfferEligible, immediateChargeCents, type Ownership } from "@/lib/offers";

const empty: Ownership = { productIds: new Set(), appIds: new Set() };

describe("isOfferEligible", () => {
  it("shows a product offer the buyer does not own", () => {
    const offer = { grantType: "product" as const, grantProductId: "p1", grantAppId: null };
    expect(isOfferEligible(offer, empty)).toBe(true);
  });

  it("hides a product offer the buyer already owns", () => {
    const offer = { grantType: "product" as const, grantProductId: "p1", grantAppId: null };
    const owned: Ownership = { productIds: new Set(["p1"]), appIds: new Set() };
    expect(isOfferEligible(offer, owned)).toBe(false);
  });

  it("hides a subscription offer the buyer already subscribes to", () => {
    const offer = { grantType: "subscription" as const, grantProductId: null, grantAppId: "app1" };
    const owned: Ownership = { productIds: new Set(), appIds: new Set(["app1"]) };
    expect(isOfferEligible(offer, owned)).toBe(false);
  });

  it("shows a subscription offer for an app the buyer lacks", () => {
    const offer = { grantType: "subscription" as const, grantProductId: null, grantAppId: "app1" };
    expect(isOfferEligible(offer, empty)).toBe(true);
  });

  it("skips a misconfigured offer with no grant target", () => {
    const offer = { grantType: "product" as const, grantProductId: null, grantAppId: null };
    expect(isOfferEligible(offer, empty)).toBe(false);
  });
});

describe("immediateChargeCents", () => {
  it("charges the full price for a one-time offer", () => {
    expect(immediateChargeCents({ billingType: "one_time", priceCents: 1700, trialDays: null })).toBe(1700);
  });

  it("charges nothing now for a trial subscription (charged after the trial)", () => {
    expect(immediateChargeCents({ billingType: "recurring", priceCents: 4700, trialDays: 7 })).toBe(0);
  });

  it("charges the first period now for a recurring offer with no trial", () => {
    expect(immediateChargeCents({ billingType: "recurring", priceCents: 4700, trialDays: 0 })).toBe(4700);
  });

  it("treats a null trial as no trial", () => {
    expect(immediateChargeCents({ billingType: "recurring", priceCents: 4700, trialDays: null })).toBe(4700);
  });
});

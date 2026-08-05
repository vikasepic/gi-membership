import { describe, it, expect } from "vitest";
import { altOfferIdFor, altSaving, offerForChoice, isOfferEligible, immediateChargeCents, type Ownership } from "@/lib/offers";

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

// --- display-side gate: never show an offer for something already held -----
import { shouldShowOffer } from "@/lib/offers";

const noneOwned = { productIds: new Set<string>(), appIds: new Set<string>() };
const subOffer = {
  grantType: "subscription" as const,
  grantProductId: null,
  grantAppId: "app-content-engine",
  active: true,
};
const prodOffer = {
  grantType: "product" as const,
  grantProductId: "prod-guide",
  grantAppId: null,
  active: true,
};

describe("shouldShowOffer", () => {
  it("shows an active offer to someone who owns nothing", () => {
    expect(shouldShowOffer(subOffer, noneOwned)).toBe(true);
  });

  it("hides a subscription offer from an existing subscriber", () => {
    // The exact case that showed the Content Engine bump to a member who was
    // already subscribed.
    const owned = { productIds: new Set<string>(), appIds: new Set(["app-content-engine"]) };
    expect(shouldShowOffer(subOffer, owned)).toBe(false);
  });

  it("hides a product offer from someone who already owns that product", () => {
    const owned = { productIds: new Set(["prod-guide"]), appIds: new Set<string>() };
    expect(shouldShowOffer(prodOffer, owned)).toBe(false);
  });

  it("hides a deactivated offer even from someone eligible", () => {
    expect(shouldShowOffer({ ...subOffer, active: false }, noneOwned)).toBe(false);
  });

  it("hides a missing offer without throwing", () => {
    expect(shouldShowOffer(null, noneOwned)).toBe(false);
    expect(shouldShowOffer(undefined, noneOwned)).toBe(false);
  });

  it("hides a misconfigured offer that grants nothing", () => {
    expect(
      shouldShowOffer({ grantType: "subscription", grantProductId: null, grantAppId: null, active: true }, noneOwned),
    ).toBe(false);
  });
});

describe("which offer a click on the upsell buys", () => {
  const shown = { id: "main" };
  const alt = { id: "alt", active: true };

  it("buys what the token names when no side was sent", () => {
    expect(offerForChoice(shown, alt, undefined)).toBe("main");
  });

  it("buys the alternative when the alternative was clicked", () => {
    expect(offerForChoice(shown, alt, "alt")).toBe("alt");
  });

  it("refuses when the placement declares no alternative", () => {
    // A form that grew a `choice` field on a page that never showed a second
    // price is a request that should buy nothing.
    expect(offerForChoice({ id: "main" }, null, "alt")).toBeNull();
  });

  it("refuses an alternative that has been switched off", () => {
    expect(offerForChoice(shown, { id: "alt", active: false }, "alt")).toBeNull();
  });

  it("refuses an alternative that is the same offer twice", () => {
    // Both radios would read the same price, and one of them would be a lie.
    expect(offerForChoice(shown, { id: "main", active: true }, "alt")).toBeNull();
  });

  it("never returns the alternative for an ordinary accept", () => {
    for (const a of [alt, null, { id: "alt", active: false }]) {
      expect(offerForChoice(shown, a, undefined)).toBe("main");
    }
  });
});

describe("the bump's two prices resolve the same way the upsell's do", () => {
  // One rule, two surfaces. The bump is a radio group and the upsell is a pair
  // of buttons, but both send a SIDE and both resolve it through the offer's
  // own alt_offer_id — so neither can be talked into charging something else.
  const bump = { id: "bump-monthly" };
  const yearly = { id: "bump-yearly", active: true };

  it("buys the price on the card when no side is sent", () => {
    expect(offerForChoice(bump, yearly, undefined)).toBe("bump-monthly");
  });

  it("buys the yearly when the yearly radio was chosen", () => {
    expect(offerForChoice(bump, yearly, "alt")).toBe("bump-yearly");
  });

  it("refuses a side on a bump that only has one price", () => {
    expect(offerForChoice({ id: "bump-monthly" }, null, "alt")).toBeNull();
  });

  it("refuses an alternative that has been switched off since the page loaded", () => {
    expect(offerForChoice(bump, { id: "bump-yearly", active: false }, "alt")).toBeNull();
  });
});

describe("saving the second billing option", () => {
  it("is null when none was chosen", () => {
    expect(altOfferIdFor("", "offer-1")).toBeNull();
    expect(altOfferIdFor(undefined, "offer-1")).toBeNull();
    expect(altOfferIdFor(null, "offer-1")).toBeNull();
  });

  it("is the offer that was chosen", () => {
    expect(altOfferIdFor("offer-2", "offer-1")).toBe("offer-2");
  });

  it("is never the offer itself", () => {
    // A row pointing at itself is refused by the database. Dropping it here
    // turns a mis-click into nothing rather than a failed save.
    expect(altOfferIdFor("offer-1", "offer-1")).toBeNull();
  });

  it("works on a new offer, which has no id yet", () => {
    expect(altOfferIdFor("offer-2", undefined)).toBe("offer-2");
  });
});

describe("what the second price saves", () => {
  const monthly = { interval: "month" as const, priceCents: 2900 };

  it("is worked out from the two prices, not typed", () => {
    // 12 × $29 is $348; $199 is five whole months less. A typed number would
    // outlive the next price change and start lying.
    expect(altSaving(monthly, { interval: "year", priceCents: 19900 })).toBe("5 months free");
  });

  it("follows a price change on its own", () => {
    // $50 a month is $600 a year; $199 is $401 less, which is 8 whole months.
    expect(altSaving({ interval: "month", priceCents: 5000 }, { interval: "year", priceCents: 19900 })).toBe(
      "8 months free",
    );
  });

  it("says nothing when the year costs more than twelve months", () => {
    expect(altSaving(monthly, { interval: "year", priceCents: 40000 })).toBeNull();
  });

  it("says nothing when the saving is under a month", () => {
    // "0 months free" is worse than silence.
    expect(altSaving(monthly, { interval: "year", priceCents: 34000 })).toBeNull();
  });

  it("says nothing about a pair that is not monthly and yearly", () => {
    expect(altSaving(monthly, { interval: "week", priceCents: 900 })).toBeNull();
    expect(altSaving({ interval: null, priceCents: 2900 }, { interval: "year", priceCents: 19900 })).toBeNull();
  });

  it("gets the singular right", () => {
    expect(altSaving(monthly, { interval: "year", priceCents: 31900 })).toBe("1 month free");
  });
});

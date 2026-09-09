import { describe, it, expect } from "vitest";
import { wiringOf, usesOf, termsOf } from "@/lib/catalogue-view";

const product = (over: Record<string, unknown> = {}) =>
  ({ status: "published", bumpOfferId: null, upsellOfferId: null, ...over }) as never;

describe("whether a product is wired up", () => {
  it("names what it has", () => {
    const w = wiringOf(product({ bumpOfferId: "o1", upsellOfferId: "o2" }), { hasPage: true, courses: 1 });
    expect(w.label).toBe("Sales page · Bump · OTO");
    expect(w.needsWiring).toBe(false);
  });

  it("flags a live product with no sales page", () => {
    // It renders perfectly and converts nobody; the only evidence otherwise is
    // a conversion rate of zero.
    const w = wiringOf(product(), { hasPage: false, courses: 1 });
    expect(w.needsWiring).toBe(true);
    expect(w.label).toContain("no sales page");
  });

  it("flags a live product with nothing to deliver", () => {
    const w = wiringOf(product(), { hasPage: true, courses: 0 });
    expect(w.label).toContain("nothing to deliver");
  });

  it("says both when both are missing", () => {
    const w = wiringOf(product(), { hasPage: false, courses: 0 });
    expect(w.label).toBe("no sales page · nothing to deliver");
  });

  it("leaves a draft alone", () => {
    // A draft with no sales page is not a problem, it is a draft. Only
    // something on sale can be broken.
    const w = wiringOf(product({ status: "draft" }), { hasPage: false, courses: 0 });
    expect(w.needsWiring).toBe(false);
  });

  it("says so when nothing is attached at all", () => {
    const w = wiringOf(product({ status: "draft" }), { hasPage: false, courses: 0 });
    expect(w.label).toBe("Nothing attached");
  });
});

describe("where an offer is used", () => {
  const products = [
    { title: "Product Validator", bumpOfferId: "o1", bumpAltOfferId: "o2", upsellOfferId: null },
    { title: "The Guide", bumpOfferId: null, bumpAltOfferId: null, upsellOfferId: "o1" },
  ] as never[];

  it("names the product and the slot", () => {
    // Changing a price on two products at once should be something you knew
    // you were doing.
    expect(usesOf({ id: "o1" }, products)).toEqual([
      { hostTitle: "Product Validator", slot: "bump" },
      { hostTitle: "The Guide", slot: "one-click upsell" },
    ]);
  });

  it("finds a second price", () => {
    expect(usesOf({ id: "o2" }, products)).toEqual([
      { hostTitle: "Product Validator", slot: "second price" },
    ]);
  });

  it("returns nothing for an offer attached to nothing", () => {
    // Either a draft or a mistake, and both are worth seeing.
    expect(usesOf({ id: "o9" }, products)).toEqual([]);
  });

  // Production, 9 Sep 2026: the Book Launch System sat in Book Writer's bump
  // slot and this screen said "Not attached to anything". Offers gained slots
  // of their own and the scan still only looked at products, so the one screen
  // built to catch an unattached offer reported a wired one as unattached.
  const offers = [
    { id: "book-writer", name: "Book Writer", bumpOfferId: "o3", upsellOfferId: null },
    { id: "funnel", name: "Funnel App", bumpOfferId: null, upsellOfferId: "o3" },
  ] as never[];

  it("finds an offer used as a bump inside another offer", () => {
    expect(usesOf({ id: "o3" }, [], offers)).toContainEqual({
      hostTitle: "Book Writer",
      slot: "bump",
    });
  });

  it("finds an offer used as the upsell of another offer", () => {
    expect(usesOf({ id: "o3" }, [], offers)).toContainEqual({
      hostTitle: "Funnel App",
      slot: "one-click upsell",
    });
  });

  it("lists product hosts and offer hosts together", () => {
    expect(usesOf({ id: "o1" }, products, offers)).toEqual([
      { hostTitle: "Product Validator", slot: "bump" },
      { hostTitle: "The Guide", slot: "one-click upsell" },
    ]);
    expect(usesOf({ id: "o3" }, products, offers)).toHaveLength(2);
  });

  it("never reports an offer as attached to itself", () => {
    // The database refuses a self-reference, but a row saying "Book Writer
    // bump" on Book Writer's own line would read as a real wiring.
    const selfish = [{ id: "o5", name: "Itself", bumpOfferId: "o5", upsellOfferId: "o5" }] as never[];
    expect(usesOf({ id: "o5" }, [], selfish)).toEqual([]);
  });

  it("still works for callers that pass no offers", () => {
    expect(usesOf({ id: "o1" }, products)).toHaveLength(2);
  });
});

describe("terms in words", () => {
  it("says what a trial actually means", () => {
    expect(termsOf({ billingType: "recurring", interval: "month", trialDays: 7 })).toBe(
      "7 days free, then per month",
    );
  });

  it("says the interval without a trial", () => {
    expect(termsOf({ billingType: "recurring", interval: "year", trialDays: null })).toBe("per year");
  });

  it("says one-time plainly", () => {
    expect(termsOf({ billingType: "one_time", interval: null, trialDays: null })).toBe("One-time");
  });

  it("assumes a month when the interval is missing", () => {
    expect(termsOf({ billingType: "recurring", interval: null, trialDays: null })).toBe("per month");
  });
});

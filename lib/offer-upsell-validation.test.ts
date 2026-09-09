import { describe, it, expect } from "vitest";
import { bumpSlotError, upsellSlotError } from "@/lib/offers";

const one = { id: "u1", active: true, currency: "usd" };

describe("what may sit in an offer's upsell slot", () => {
  it("allows a live offer in the host's own currency", () => {
    expect(upsellSlotError(one, "host", "usd")).toBeNull();
  });

  it("allows an empty slot", () => {
    expect(upsellSlotError(null, "host", "usd")).toBeNull();
  });

  it("refuses an offer upselling itself", () => {
    expect(upsellSlotError({ ...one, id: "host" }, "host", "usd")).toMatch(/itself/i);
  });

  it("refuses an offer that is not on sale", () => {
    expect(upsellSlotError({ ...one, active: false }, "host", "usd")).toMatch(/not active/i);
  });

  it("refuses an upsell priced in a different currency than its host", () => {
    expect(upsellSlotError({ ...one, currency: "eur" }, "host", "usd")).toMatch(/currency/i);
  });

  it("allows a RECURRING offer, as the bump slot now does too", () => {
    // An upsell is charged (or subscribed) on its own, off the saved card, by
    // acceptOto — exactly as buying that offer any other way would. There is
    // no off-session-at-checkout problem for a recurring price to create here,
    // so upsellSlotError must not carry bumpSlotError's billing-type refusal.
    const recurring = { id: "u1", billingType: "recurring", active: true, currency: "usd" };
    expect(upsellSlotError(recurring, "host", "usd")).toBeNull();
    // This used to also assert that bumpSlotError REFUSED the same shape, to
    // prove the two functions genuinely disagreed. They agree now — the bump
    // slot takes a recurring offer too — so that half is gone rather than
    // inverted: asserting both return null proves nothing about either.
    expect(bumpSlotError(recurring, "host", "usd")).toBeNull();
  });
});

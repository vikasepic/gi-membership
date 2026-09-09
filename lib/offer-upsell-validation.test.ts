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

  it("allows a RECURRING offer — unlike a bump, an upsell is never folded into the host's own payment", () => {
    // An upsell is charged (or subscribed) on its own, off the saved card, by
    // acceptOto — exactly as buying that offer any other way would. There is
    // no off-session-at-checkout problem for a recurring price to create here,
    // so upsellSlotError must not carry bumpSlotError's billing-type refusal.
    const recurring = { id: "u1", billingType: "recurring", active: true, currency: "usd" };
    expect(upsellSlotError(recurring, "host", "usd")).toBeNull();
    // The exact same shape DOES refuse as a bump — proving the two functions
    // genuinely disagree on this case, not just that neither happens to check it.
    expect(bumpSlotError(recurring, "host", "usd")).toMatch(/one-time/i);
  });
});

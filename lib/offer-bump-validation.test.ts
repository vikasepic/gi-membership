import { describe, it, expect } from "vitest";
import { bumpSlotError } from "@/lib/offers";

const one = { id: "b1", billingType: "one_time", active: true, currency: "usd" };

describe("what may sit in an offer's bump slot", () => {
  it("allows a live one-time offer in the host's own currency", () => {
    expect(bumpSlotError(one, "host", "usd")).toBeNull();
  });

  it("allows an empty slot", () => {
    expect(bumpSlotError(null, "host", "usd")).toBeNull();
  });

  it("refuses a recurring offer, and says why", () => {
    // A recurring bump means creating a subscription from a saved card after
    // the fact — off-session, which Stripe refuses on an Indian card. Better
    // refused in the form than at the till.
    const msg = bumpSlotError({ id: "b1", billingType: "recurring", active: true, currency: "usd" }, "host", "usd");
    expect(msg).toMatch(/one-time/i);
  });

  it("refuses an offer that is not on sale", () => {
    expect(bumpSlotError({ ...one, active: false }, "host", "usd")).toMatch(/not active/i);
  });

  it("refuses an offer bumping itself", () => {
    expect(bumpSlotError({ ...one, id: "host" }, "host", "usd")).toMatch(/itself/i);
  });

  it("refuses a bump priced in a different currency than its host", () => {
    // The bump's cents ride straight into an amount charged in the HOST's
    // currency (one PaymentIntent, startOfferCheckout) — nothing converts
    // between them, so a mismatch adds two numbers that are not the same
    // unit and charges the sum as though they were.
    expect(bumpSlotError({ ...one, currency: "eur" }, "host", "usd")).toMatch(/currency/i);
  });
});

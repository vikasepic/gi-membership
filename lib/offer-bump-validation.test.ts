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

  it("ALLOWS a recurring offer — it bills on its own subscription", () => {
    // This used to be refused, on the grounds that a recurring bump would need
    // an off-session charge afterwards. That was wrong: a recurring bump takes
    // nothing today and creates its own subscription at fulfilment, which is
    // exactly what the product checkout has always done with one. The only
    // impossible combination is a ONE-TIME bump on a recurring host price,
    // which depends on the price the buyer picks and so is refused in
    // startOfferCheckout, not here.
    expect(
      bumpSlotError({ id: "b1", billingType: "recurring", active: true, currency: "usd" }, "host", "usd"),
    ).toBeNull();
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

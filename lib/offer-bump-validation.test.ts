import { describe, it, expect } from "vitest";
import { bumpSlotError } from "@/lib/offers";

const one = { id: "b1", billingType: "one_time", active: true };

describe("what may sit in an offer's bump slot", () => {
  it("allows a live one-time offer", () => {
    expect(bumpSlotError(one, "host")).toBeNull();
  });

  it("allows an empty slot", () => {
    expect(bumpSlotError(null, "host")).toBeNull();
  });

  it("refuses a recurring offer, and says why", () => {
    // A recurring bump means creating a subscription from a saved card after
    // the fact — off-session, which Stripe refuses on an Indian card. Better
    // refused in the form than at the till.
    const msg = bumpSlotError({ id: "b1", billingType: "recurring", active: true }, "host");
    expect(msg).toMatch(/one-time/i);
  });

  it("refuses an offer that is not on sale", () => {
    expect(bumpSlotError({ ...one, active: false }, "host")).toMatch(/not active/i);
  });

  it("refuses an offer bumping itself", () => {
    expect(bumpSlotError({ ...one, id: "host" }, "host")).toMatch(/itself/i);
  });
});

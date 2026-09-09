import { describe, it, expect } from "vitest";
import { membershipTerms } from "@/lib/offer-terms";

describe("membershipTerms", () => {
  it("says a one-time price is paid once, with no interval after the amount", () => {
    const t = membershipTerms({ billingType: "one_time", interval: null, trialDays: null }, "$19");
    expect(t.suffix).toBeNull();
    expect(t.terms).toBe("One-time payment. Yours to keep.");
    // The bug this replaces: a null interval interpolated into a sentence.
    expect(t.terms).not.toContain("null");
  });

  it("keeps the subscription wording exactly as it was", () => {
    expect(membershipTerms({ billingType: "recurring", interval: "month", trialDays: null }, "$47")).toEqual({
      suffix: "/month",
      terms: "Billed every month. Cancel any time.",
    });
    expect(membershipTerms({ billingType: "recurring", interval: "month", trialDays: 7 }, "$47")).toEqual({
      suffix: "/month",
      terms: "Free for 7 days, then $47 each month. Cancel any time before then and you pay nothing.",
    });
  });

  it("treats a recurring row with no interval as one-time rather than printing null", () => {
    // The offer check constraint forbids this shape, but a mirror column can
    // lag a price edit for a moment; the card must not lie in that moment.
    const t = membershipTerms({ billingType: "recurring", interval: null, trialDays: null }, "$19");
    expect(t.terms).not.toContain("null");
  });
});

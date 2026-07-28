import { describe, it, expect } from "vitest";
import { mapSubscriptionStatus, hasAccess } from "@/lib/subscription-sync";

describe("mapSubscriptionStatus", () => {
  it("keeps a trialing subscription on trial", () => {
    expect(mapSubscriptionStatus("trialing")).toBe("trialing");
  });

  it("marks a converted trial active", () => {
    expect(mapSubscriptionStatus("active")).toBe("active");
  });

  it("marks a failed renewal past_due rather than revoking immediately", () => {
    // Dunning: Stripe retries for days. Revoking on the first failure would cut
    // off a paying customer whose card simply expired.
    expect(mapSubscriptionStatus("past_due")).toBe("past_due");
  });

  it("treats an unpaid subscription as past_due", () => {
    expect(mapSubscriptionStatus("unpaid")).toBe("past_due");
  });

  it("cancels when the subscription is canceled", () => {
    expect(mapSubscriptionStatus("canceled")).toBe("canceled");
  });

  it("cancels when an incomplete subscription expires", () => {
    expect(mapSubscriptionStatus("incomplete_expired")).toBe("canceled");
  });

  it("treats incomplete (3DS not yet completed) as past_due, not active", () => {
    // Off-session 3DS at the day-7 conversion lands here: the charge needs
    // customer action. They must not silently keep full access as if paid.
    expect(mapSubscriptionStatus("incomplete")).toBe("past_due");
  });

  it("falls back to past_due for an unrecognised status rather than granting access", () => {
    expect(mapSubscriptionStatus("something_new")).toBe("past_due");
  });
});

describe("hasAccess", () => {
  it("grants access while active or trialing", () => {
    expect(hasAccess("active")).toBe(true);
    expect(hasAccess("trialing")).toBe(true);
  });

  it("keeps access during past_due so dunning can recover the card", () => {
    expect(hasAccess("past_due")).toBe(true);
  });

  it("denies access once canceled", () => {
    expect(hasAccess("canceled")).toBe(false);
  });
});

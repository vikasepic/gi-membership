import { describe, it, expect } from "vitest";
import { mapSubscriptionStatus, hasAccess } from "@/lib/subscription-sync";
import { unionEntitlement } from "@/lib/app-sync";

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

  it("gives no answer for a status it does not recognise, instead of calling it past_due", () => {
    // It used to answer past_due, on the stated grounds that flagging an
    // account for dunning is safer than granting access. That stopped being
    // true on 7 Sep 2026, when past_due began counting as live in
    // unionEntitlement: from then on a status nobody had read granted the
    // subscription's channels. No answer is the honest one, and the callers
    // write nothing when they get it.
    expect(mapSubscriptionStatus("something_new")).toBeNull();
  });

  it("gives no answer for paused, which is neither dunning nor cancellation", () => {
    // A real Stripe status that nothing here handles. pause_collection stops
    // the money without ending the subscription, so neither past_due (which
    // leaves the app unlocked) nor canceled (which takes it away) is a call
    // this mapping gets to make on its own.
    expect(mapSubscriptionStatus("paused")).toBeNull();
  });
});

describe("the dunning fallback and the channel union together", () => {
  it("still grants channels for a card in dunning, and has nothing to grant for a status it cannot read", () => {
    // The two halves of the bug in one place: past_due must keep its channels
    // (Stripe is still collecting), and an unreadable status must not reach
    // the union at all — not as past_due, which would hand over the channels.
    const dunning = mapSubscriptionStatus("past_due");
    expect(dunning).toBe("past_due");
    expect(unionEntitlement([{ channels: ["instagram"], status: dunning! }]).channels).toEqual([
      "instagram",
    ]);
    expect(mapSubscriptionStatus("paused")).toBeNull();
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

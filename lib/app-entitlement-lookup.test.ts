import { describe, it, expect } from "vitest";
import { lookupAnswer } from "@/lib/app-entitlement-lookup";

const owned = (channels: string[], status: "active" | "trialing" | "canceled" | "past_due") => ({
  channels,
  status,
});

describe("what the store answers when an app asks about one email", () => {
  it("lists the channels they are paying for", () => {
    expect(lookupAnswer({ rows: [owned(["instagram"], "active")], pending: null })).toEqual({
      hasAccess: true,
      channels: ["instagram"],
    });
  });

  it("adds up two subscriptions into one answer", () => {
    expect(
      lookupAnswer({
        rows: [owned(["instagram"], "active"), owned(["linkedin"], "trialing")],
        pending: null,
      }),
    ).toEqual({ hasAccess: true, channels: ["instagram", "linkedin"] });
  });

  // The push contract: past_due keeps its channel because Stripe is still
  // collecting. The pull must not disagree with the push about this, or a
  // customer's access depends on which direction the question travelled.
  it("keeps a past_due channel", () => {
    expect(lookupAnswer({ rows: [owned(["instagram"], "past_due")], pending: null })).toEqual({
      hasAccess: true,
      channels: ["instagram"],
    });
  });

  it("drops a cancelled subscription's channel but keeps the live one", () => {
    expect(
      lookupAnswer({
        rows: [owned(["instagram"], "active"), owned(["linkedin"], "canceled")],
        pending: null,
      }),
    ).toEqual({ hasAccess: true, channels: ["instagram"] });
  });

  it("says no when every subscription is cancelled", () => {
    expect(lookupAnswer({ rows: [owned(["instagram"], "canceled")], pending: null })).toEqual({
      hasAccess: false,
    });
  });

  // A definitive no, not a shrug. The store has no record of this email, so
  // the asking app should stop waiting rather than keep retrying.
  it("says no for an email the store has never seen", () => {
    expect(lookupAnswer({ rows: [], pending: null })).toEqual({ hasAccess: false });
  });

  // An app-reported subscription parked by email. pending_app_entitlements has
  // no channels column, so the store knows they hold SOMETHING and cannot say
  // which channels. Omitting channels is the contract's "no change" — the
  // asking app must not turn it into a grant, and must not revoke either.
  it("reports access without channels for a parked app-reported entitlement", () => {
    expect(lookupAnswer({ rows: [], pending: { status: "active" } })).toEqual({
      hasAccess: true,
    });
  });

  it("says no for a parked entitlement that is cancelled", () => {
    expect(lookupAnswer({ rows: [], pending: { status: "canceled" } })).toEqual({
      hasAccess: false,
    });
  });

  // An offer that grants the app but carries no channels (the Funnel App
  // shape). Access is real; there is no channel list to send.
  it("omits channels when a live subscription grants none", () => {
    expect(lookupAnswer({ rows: [owned([], "active")], pending: null })).toEqual({
      hasAccess: true,
    });
  });
});

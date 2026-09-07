import { describe, it, expect } from "vitest";
import { unionEntitlement } from "@/lib/app-sync";

const row = (channels: string[], status: "active" | "trialing" | "canceled" | "past_due") => ({
  appId: "a1",
  channels,
  status,
});

describe("what one person is entitled to in one app", () => {
  it("adds up the channels they are paying for", () => {
    expect(unionEntitlement([row(["instagram"], "active"), row(["linkedin"], "active")])).toEqual({
      channels: ["instagram", "linkedin"],
      status: "active",
    });
  });

  it("drops the channels of a cancelled subscription", () => {
    // The case that catches a merge bug on the receiving side, and the reason
    // this function exists: cancelling Instagram must actually take Instagram
    // away while LinkedIn carries on.
    expect(unionEntitlement([row(["instagram"], "canceled"), row(["linkedin"], "active")])).toEqual({
      channels: ["linkedin"],
      status: "active",
    });
  });

  it("is cancelled only when everything is", () => {
    expect(unionEntitlement([row(["instagram"], "canceled"), row(["linkedin"], "canceled")])).toEqual({
      channels: [],
      status: "canceled",
    });
  });

  it("reports a trial while any part of it is trialing", () => {
    expect(unionEntitlement([row(["instagram"], "trialing"), row(["linkedin"], "active")]).status).toBe("trialing");
  });

  it("keeps a past_due channel, whatever else the person holds", () => {
    // Stripe dunning runs for days and often succeeds. Dropping the channel on
    // the FIRST failed charge takes away something they have paid for while it
    // is still being collected.
    //
    // And it has to be the same answer either way round. With `past_due`
    // excluded, a failing card cost a person LinkedIn instantly if they also
    // held Instagram, and cost them nothing if LinkedIn was all they had — the
    // outcome decided by what else was in their account. Content Engine found
    // that reading the contract; nobody chose it.
    expect(unionEntitlement([row(["instagram"], "active"), row(["linkedin"], "past_due")])).toEqual({
      channels: ["instagram", "linkedin"],
      status: "active",
    });
    expect(unionEntitlement([row(["linkedin"], "past_due")])).toEqual({
      channels: ["linkedin"],
      status: "past_due",
    });
  });

  it("still drops a cancelled channel while a past_due one survives", () => {
    // `canceled` is the revoke signal; `past_due` is a warning. Widening the
    // union must not blur the two.
    expect(unionEntitlement([row(["instagram"], "canceled"), row(["linkedin"], "past_due")])).toEqual({
      channels: ["linkedin"],
      status: "past_due",
    });
  });

  it("reports past_due only when nothing is live", () => {
    expect(unionEntitlement([row(["instagram"], "past_due"), row(["linkedin"], "active")]).status).toBe("active");
    expect(unionEntitlement([row(["instagram"], "past_due")]).status).toBe("past_due");
  });

  it("does not repeat a channel two subscriptions share", () => {
    expect(unionEntitlement([row(["instagram"], "active"), row(["instagram", "linkedin"], "active")]).channels)
      .toEqual(["instagram", "linkedin"]);
  });

  it("leaves an app that grants no channels with none", () => {
    // The Funnel App. Its union must stay empty so the field is omitted from
    // the payload exactly as it is today.
    expect(unionEntitlement([row([], "active")])).toEqual({ channels: [], status: "active" });
  });
});

import { readFileSync } from "node:fs";

describe("the purchase path and the sync path agree", () => {
  it("grantOfferOwnership sends the union, not one offer's channels", () => {
    // The bug this closes: buying LinkedIn told the app channels:["linkedin"],
    // revoking Instagram at the moment of the second purchase. Two code paths
    // that answer the same question differently is the defect, not the wording.
    const src = readFileSync("lib/checkout.ts", "utf8");
    expect(src).toContain("pushAppEntitlement");
    // The hand-built call passed the single offer's channels straight through.
    expect(src).not.toMatch(/channels:\s*offer\.grantChannels/);
  });
});

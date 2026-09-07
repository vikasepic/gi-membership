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

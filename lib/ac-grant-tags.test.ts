import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { lifecycleTagOps } from "@/lib/ac-tags";

/**
 * Where the CRM finds out someone started a trial.
 *
 * Found live 22 Sep 2026: tagging ran only in `finalizeOrder`, which is the
 * product checkout. An offer bought on its own page grants access through
 * `completeOfferCheckout`, which never reaches it, so 57 Content Engine
 * trialists carried no trial tag and no nurture sequence had ever started for
 * any of them. The one real member who DID have the tag had taken the offer
 * as a bump on a product order, which is the path that went through
 * `finalizeOrder`. That contrast is the whole bug.
 */
const checkout = readFileSync("lib/checkout.ts", "utf8");
const grant = checkout.slice(
  checkout.indexOf("export async function grantOfferOwnership"),
  checkout.indexOf("export async function resolveOtoForOrder"),
);

describe("granting access tells the CRM", () => {
  it("tags inside grantOfferOwnership, the one function every grant passes through", () => {
    // Four call sites reach it: a bump, the offer checkout, an accepted OTO,
    // and a manual grant. Tagging here covers all four at once.
    expect(grant).toContain("tagLifecycle({ userId, offerIds: [offer.id]");
  });

  it("sends the status the offer actually starts in", () => {
    expect(grant).toContain('status: trialing ? "trialing" : "active"');
  });

  it("never lets the CRM fail the grant", () => {
    // The card is already charged by this point.
    const call = grant.slice(grant.indexOf("tagLifecycle"));
    expect(grant.slice(0, grant.indexOf("tagLifecycle"))).toContain("try {");
    expect(call).toContain("catch");
    expect(call).toContain("lifecycle tag failed");
  });
});

describe("what each status earns", () => {
  const tags = { buyer: "109", trial: "117", cancelled: "116" };

  it("a trial gets the trial tag and nothing else", () => {
    expect(lifecycleTagOps(tags, "trialing")).toEqual({ add: ["117"], remove: [] });
  });

  it("paying swaps the trial tag for the buyer tag", () => {
    expect(lifecycleTagOps(tags, "active")).toEqual({ add: ["109"], remove: ["117"] });
  });

  it("cancelling takes the buyer tag away and leaves the trial one", () => {
    // The trial tag is the only record that this person tried it and did not
    // stay, which is exactly the segment these tags exist to build.
    expect(lifecycleTagOps(tags, "canceled")).toEqual({ add: ["116"], remove: ["109"] });
  });

  it("says nothing while a card is being retried", () => {
    expect(lifecycleTagOps(tags, "past_due")).toEqual({ add: [], remove: [] });
  });

  it("skips a tag an offer has not configured", () => {
    expect(lifecycleTagOps({ buyer: "130", trial: null, cancelled: "131" }, "trialing")).toEqual({ add: [], remove: [] });
  });
});

describe("the backfill", () => {
  const backfill = readFileSync("lib/ac-backfill.ts", "utf8");

  it("tags people for the state they are in now, not the one they bought in", () => {
    // Someone who started a trial and has since cancelled must not be dropped
    // into a trial sequence weeks later.
    expect(backfill).toContain("status: g.status");
    expect(backfill).toContain("tagLifecycle");
  });

  it("leaves a card being retried alone", () => {
    expect(backfill).toContain('r.status === "past_due"');
  });

  it("groups a person's offers into one call", () => {
    // One member holding three Content Engine channels is one contact, not
    // three round trips.
    expect(backfill).toContain("`${r.userId}:${r.status}`");
  });

  it("paces itself, because ActiveCampaign is rate limited", () => {
    expect(backfill).toContain("PACE_MS");
    expect(backfill).toContain("await sleep(PACE_MS)");
  });

  it("carries on when one contact fails", () => {
    expect(backfill).toContain("note(`error:");
  });

  it("offers a dry run, since a real one starts sequences for real people", () => {
    expect(backfill).toContain("opts?.dryRun");
  });
});

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
  it("tags inside grantOfferOwnership, the one function every purchase grant passes through", () => {
    // Three call sites reach it: a bump, the offer checkout and an accepted
    // OTO. Tagging here covers all three at once.
    expect(grant).toContain("tagAccessGranted({ userId, offerId: offer.id");
  });

  it("sends the status the offer actually starts in", () => {
    expect(grant).toContain('status: trialing ? "trialing" : "active"');
  });

  it("never lets the CRM fail the grant", () => {
    // The card is already charged by this point, so the guard lives inside
    // the helper and every caller inherits it rather than repeating it.
    const acTags = readFileSync("lib/ac-tags.ts", "utf8");
    const helper = acTags.slice(acTags.indexOf("export async function tagAccessGranted"));
    expect(helper).toContain("try {");
    expect(helper).toContain("catch");
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

/**
 * Access arrives five ways and only one of them used to reach the CRM.
 *
 * Found 22 Sep 2026 while auditing the rest: a member holding the Digital
 * Product Validator through a grant carried none of its product tags, because
 * product tagging keyed on a paid order line rather than on what someone
 * actually owns. Two live offers grant that product, so the next buyer on an
 * offer page would have been missed the same way.
 */
describe("every way access is granted tells the CRM", () => {
  const members = readFileSync("lib/members.ts", "utf8");

  it("a comped product is tagged", () => {
    const fn = members.slice(members.indexOf("export async function grantProduct"), members.indexOf("export async function grantOfferAccess"));
    expect(fn).toContain("tagAccessGranted({ userId: args.userId, productId: args.productId");
  });

  it("comped offer access is tagged, offer and product both", () => {
    const fn = members.slice(members.indexOf("export async function grantOfferAccess"));
    expect(fn).toContain("offerId: offer.id");
    expect(fn).toContain("productId: offer.grantProductId");
  });

  it("an offer that grants a product applies both tags", () => {
    // The offer's own buyer tag, and the granted product's.
    expect(grant).toContain("productId: offer.grantProductId, status: \"active\"");
  });

  it("the helper never lets the CRM undo a grant", () => {
    const acTags = readFileSync("lib/ac-tags.ts", "utf8");
    const fn = acTags.slice(acTags.indexOf("export async function tagAccessGranted"));
    expect(fn).toContain("catch");
    expect(fn).toContain("the grant stands");
  });
});

describe("the backfill covers products as well as offers", () => {
  const backfill = readFileSync("lib/ac-backfill.ts", "utf8");

  it("keys product tags on what someone owns, not on an order line", () => {
    expect(backfill).toContain("tagPurchase({ userId, productIds:");
    expect(backfill).toContain('.eq("status", "active")');
  });

  it("counts a person once even when they hold both a product and an offer", () => {
    expect(backfill).toContain("new Set([...wanted.map((r) => r.userId), ...byUser.keys()]).size");
  });
});

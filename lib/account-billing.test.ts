import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The account page is where connected apps now send their store-billed
 * members, so it has to be honest about whether there is anything to manage.
 *
 * Someone comped by hand or provisioned by an app holds real access with no
 * Stripe customer behind it. Before this, they were shown "Manage billing",
 * bounced through the portal action, and returned to a line saying billing
 * appears after their first purchase — which reads as a broken account to
 * someone who plainly has access.
 */
const page = readFileSync("app/(store)/account/page.tsx", "utf8");
const members = readFileSync("lib/members.ts", "utf8");

describe("the billing section", () => {
  it("asks whether a portal exists before drawing the button", () => {
    expect(members).toContain("export async function hasBillingAccount");
    expect(page).toContain("hasBillingAccount(user.id)");
    expect(page).toContain("billing === \"none\" || !canBill");
  });

  it("does not tell someone who already has access to wait for their first purchase", () => {
    // The old copy. Scoped to the page's own text, not to a comment about it.
    expect(page).not.toContain("billing appears here after your first purchase");
  });

  it("offers a way to ask, since only support can explain a comped account", () => {
    expect(page).toContain("legal.contactEmail");
  });
});

describe("the bridge contract records what breaks people", () => {
  const contract = readFileSync("docs/app-bridge-contract.md", "utf8");

  it("pins hasAccess to period end, not to the cancellation request", () => {
    // Content Engine acts on hasAccess alone. Moving it early cuts people off
    // from something they have paid for, in the app, where nobody looks.
    expect(contract).toContain("must not move");
    expect(contract).toContain("only when Stripe itself flips to `canceled`");
    expect(contract).toContain("when a cancellation is\n*requested*");
  });

  it("records that an app may not sell a plan to someone the store bills", () => {
    expect(contract).toContain("must not offer a plan to someone the store already bills");
  });
});

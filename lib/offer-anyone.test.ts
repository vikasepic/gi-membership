import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * An offer can be bought by anybody.
 *
 * It could not before. The offer checkout was built for the library upsell — a
 * member being shown an add-on — so it redirected everybody else to /login.
 * Then offers got public sales pages, and that redirect became a wall in front
 * of every one of them: an ad click landing on a price, a button, and a demand
 * to make an account before the store would take the money.
 *
 * These pin the pieces that make it safe, because every one of them is a way to
 * get it wrong quietly.
 */

const page = readFileSync("app/(store)/checkout/offer/page.tsx", "utf8");
const actions = readFileSync("app/(store)/checkout/offer/actions.ts", "utf8");
const complete = readFileSync("app/(store)/checkout/offer/complete/route.ts", "utf8");
const checkout = readFileSync("lib/checkout.ts", "utf8");
const post = readFileSync("lib/post-purchase.ts", "utf8");

describe("the wall is gone", () => {
  it("no longer sends a stranger to log in", () => {
    expect(page).not.toContain("redirect(`/login");
  });

  it("only checks ownership for somebody who has some", () => {
    // ownershipFor(undefined) on a stranger is a question with no answer.
    expect(page).toMatch(/if \(user\?\.id\) \{[\s\S]{0,240}isOfferEligible/);
  });

  it("shows a stranger the trial rather than guessing at their history", () => {
    // Same rule the product checkout follows: we cannot know what a stranger
    // has used until they tell us an address, and fulfilment refuses then.
    expect(page).toContain("offerAsSoldTo(user?.email ?? null");
  });
});

describe("who the card belongs to", () => {
  it("takes a member from the session, never from the form", () => {
    // The one thing that must not regress. A name and an address in a request
    // body are not proof of anything, so a session — when there is one — wins.
    expect(actions).toMatch(/user\?\.id\s*\n?\s*\?\s*\{ existingUserId: user\.id \}/);
  });

  it("reads the form only when there is no session", () => {
    expect(actions).toContain("{ email: buyer?.email, fullName: buyer?.fullName }");
  });

  it("creates the account through the same code the product checkout uses", () => {
    // Two checkouts each creating accounts their own way is two places to get
    // it wrong, and only one would ever get fixed. Both now continue with an
    // existing account rather than refusing — see abandoned-signup.test.ts for
    // why that is only safe alongside the sign-in guard.
    expect(actions).toContain("resolveBuyer");
    expect(checkout).toContain("export async function resolveBuyer");
    expect(checkout).toContain("isNew: false");
  });
});

describe("getting in afterwards", () => {
  it("signs a first-time buyer in on the way back", () => {
    // They have just signed up at checkout and have no password. Without this
    // they land on /library, bounce to /login, and have to go and find an email
    // to open the thing they just paid for.
    expect(complete).toContain("mintOfferLogin");
    expect(complete).toContain("verifyOtp");
  });

  it("is a route handler, because a page cannot set a cookie", () => {
    expect(complete).toContain("export async function GET");
  });

  it("never swaps a signed-in member onto another account", () => {
    expect(complete).toMatch(/if \(!user\) \{/);
  });

  it("hands out one session per purchase and no more", () => {
    // The return URL is otherwise a login link for anybody who ever sees it.
    // Claim-before-mint, with the compare half of a compare-and-set.
    const mint = post.slice(post.indexOf("export async function mintOfferLogin"));
    expect(mint).toContain("client_secret !== clientSecret");
    expect(mint).toContain('si.status !== "succeeded"');
    expect(mint).toContain('.is("session_granted_at", null)');
    // Claimed before the link is minted, not after.
    expect(mint.indexOf(".is(\"session_granted_at\", null)")).toBeLessThan(mint.indexOf("generateLink"));
  });
});

describe("the migration behind it", () => {
  const sql = readFileSync("supabase/migrations/0060_ownership_session_claim.sql", "utf8");
  it("adds the claim column the guard needs", () => {
    expect(sql).toMatch(/alter table ownership add column if not exists session_granted_at/i);
  });
});

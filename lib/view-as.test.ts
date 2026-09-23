import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Opening the store as one of its members.
 *
 * The signature is the whole security of this. The cookie names whose account
 * the store renders, so anything that can forge it can become any member in
 * the store, including whoever holds the most access. These tests are about
 * the ways a forgery could be made to pass.
 */
vi.mock("@/lib/env", () => ({ otoSigningSecret: () => "test-signing-secret-aaaaaaaaaaaa" }));

let signViewAsToken: typeof import("@/lib/view-as").signViewAsToken;
let verifyViewAsToken: typeof import("@/lib/view-as").verifyViewAsToken;

beforeAll(async () => {
  const mod = await import("@/lib/view-as");
  signViewAsToken = mod.signViewAsToken;
  verifyViewAsToken = mod.verifyViewAsToken;
});

const ADMIN = "admin-1";
const MEMBER = "member-9";

describe("the token", () => {
  it("round-trips the pair it was minted for", () => {
    const t = signViewAsToken(ADMIN, MEMBER);
    expect(verifyViewAsToken(t)).toMatchObject({ admin: ADMIN, member: MEMBER });
  });

  it("refuses a body that was edited after signing", () => {
    // The obvious attack: take your own valid token and change the member id.
    const t = signViewAsToken(ADMIN, MEMBER);
    const [body, sig] = t.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    payload.member = "someone-else";
    const forged = Buffer.from(JSON.stringify(payload)).toString("base64url") + "." + sig;
    expect(verifyViewAsToken(forged)).toBeNull();
  });

  it("refuses an unsigned or half-formed token", () => {
    expect(verifyViewAsToken(undefined)).toBeNull();
    expect(verifyViewAsToken("")).toBeNull();
    expect(verifyViewAsToken("no-dot")).toBeNull();
    expect(verifyViewAsToken(".")).toBeNull();
    const body = Buffer.from(JSON.stringify({ admin: ADMIN, member: MEMBER, exp: 9e9 })).toString("base64url");
    expect(verifyViewAsToken(`${body}.`)).toBeNull();
    expect(verifyViewAsToken(`${body}.not-the-signature`)).toBeNull();
  });

  it("refuses one that has expired", () => {
    const twoHoursAgo = Date.now() - 2 * 3600_000;
    expect(verifyViewAsToken(signViewAsToken(ADMIN, MEMBER, twoHoursAgo))).toBeNull();
  });

  it("expires within the hour", () => {
    const t = signViewAsToken(ADMIN, MEMBER);
    expect(verifyViewAsToken(t, Date.now() + 59 * 60_000)).not.toBeNull();
    expect(verifyViewAsToken(t, Date.now() + 61 * 60_000)).toBeNull();
  });

  it("refuses a payload missing either party", () => {
    const body = Buffer.from(JSON.stringify({ admin: ADMIN, exp: 9e9 })).toString("base64url");
    expect(verifyViewAsToken(body + ".x")).toBeNull();
  });
});

describe("what the resolver guarantees", () => {
  const src = readFileSync("lib/view-as.ts", "utf8");

  it("checks the token was minted for the person holding it", () => {
    // Otherwise one admin's token works in another browser.
    expect(src).toContain("payload.admin !== user.id");
  });

  it("re-checks admin rights on every call, not only when the token is made", () => {
    // A token outlives a demotion otherwise.
    expect(src).toContain("userIsAdmin");
  });

  it("compares signatures in constant time, length first", () => {
    // timingSafeEqual throws on a length mismatch rather than returning false.
    expect(src).toContain("a.length !== b.length || !timingSafeEqual(a, b)");
  });

  it("keeps the cookie away from scripts", () => {
    expect(src).toContain("httpOnly: true");
    expect(src).toContain("sameSite: \"lax\"");
  });

  it("falls back to the admin's own account if the member has gone", () => {
    expect(src).toContain("if (!member)");
  });
});

describe("the line this does not cross", () => {
  it("refuses to start a checkout while standing in for someone", () => {
    // Support actions are allowed by design. Spending a member's money is
    // not: nothing about inspecting an account calls for it.
    const checkout = readFileSync("app/(store)/checkout/actions.ts", "utf8");
    const offer = readFileSync("app/(store)/checkout/offer/actions.ts", "utf8");
    for (const src of [checkout, offer]) {
      expect(src).toContain("if (await isViewingAs())");
      expect(src).toContain("Stop viewing before buying");
    }
  });

  it("refuses the one-tap offer, which charges a card on file", () => {
    const lib = readFileSync("app/(store)/library/actions.ts", "utf8");
    expect(lib).toContain("if (await isViewingAs()) redirect(\"/library?offer=viewing_as\")");
  });

  it("explains itself on the page rather than failing silently", () => {
    const page = readFileSync("app/(store)/library/page.tsx", "utf8");
    expect(page).toContain("viewing_as:");
  });
});

describe("the banner", () => {
  const layout = readFileSync("app/(store)/layout.tsx", "utf8");

  it("is on every store page, because the layout draws it", () => {
    expect(layout).toContain("who?.viewingAs && <ViewAsBanner");
  });

  it("names who you are and offers the way out", () => {
    const banner = readFileSync("components/view-as-banner.tsx", "utf8");
    expect(banner).toContain("Viewing as");
    expect(banner).toContain("Stop and go back");
    expect(banner).toContain("stopViewAsAction");
  });
});

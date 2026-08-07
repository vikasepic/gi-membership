import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * "Change your email" has to reach a person.
 *
 * It shipped pointing at `/account?billing=none` — a link that contacted
 * nobody and, worse, set the very flag that makes the Billing section below it
 * render "Nothing to manage yet". A member with purchases who clicked it was
 * told they had no billing.
 *
 * A route rather than a mailto is the mistake worth guarding: nothing about it
 * looks wrong in review, and nothing fails at runtime.
 */
const src = readFileSync("components/account/your-details.tsx", "utf8");

describe("the account details links", () => {
  it("mails a real address rather than navigating", () => {
    expect(src).toContain("href={`mailto:${supportEmail}");
  });

  it("never links to the billing=none flag", () => {
    // Matched on href only: the comment explaining the old bug names the flag,
    // and a test that fails on its own documentation teaches people to delete
    // the documentation.
    expect(src).not.toMatch(/href=[^\n]*billing=none/);
  });

  it("takes the address from the store rather than hardcoding one", () => {
    // A typed address here would keep mailing an inbox nobody reads after the
    // store changed its support address in settings.
    expect(src).toContain("supportEmail: string");
    expect(src).not.toMatch(/mailto:[a-z0-9.@]+["`]/i);
  });
});

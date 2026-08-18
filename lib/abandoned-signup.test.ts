import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Buying with an address that already has an account.
 *
 * Nobody is turned away at the payment step. The account is created BEFORE the
 * card is charged, so a decline or a closed tab leaves one behind owning
 * nothing — and "an account with this email exists, please log in" then sent
 * that buyer to a login for an account with no password and nothing in it. A
 * dead end caused by their own first attempt failing, at the worst possible
 * moment. Buying twice is allowed too; that is bookkeeping, not a reason to
 * stop somebody paying.
 *
 * What must NOT follow is a session. Letting anybody pay under any address is
 * only safe while paying under an address is not a way into the account behind
 * it — otherwise $19 buys somebody else's library. That is the whole point of
 * this file.
 */

const checkout = readFileSync("lib/checkout.ts", "utf8");
const post = readFileSync("lib/post-purchase.ts", "utf8");
const offer = readFileSync("lib/offer-checkout.ts", "utf8");
const actions = readFileSync("app/(store)/checkout/offer/actions.ts", "utf8");

describe("nobody is stopped from paying", () => {
  it("continues with the existing account rather than refusing", () => {
    expect(checkout).toContain("const existing = await userIdForEmail(email);");
    expect(checkout).toMatch(/return \{ ok: true, userId: existing, email, isNew: false \};/);
  });

  it("no longer tells anybody to go and log in", () => {
    // The message and its code are gone, not merely unreachable — a checkout
    // that can refuse at the payment step is a checkout that eventually will.
    expect(checkout).not.toContain("An account with this email exists");
    expect(checkout).not.toContain("account_exists");
  });
});

describe("paying is not a way in", () => {
  it("says whether this checkout created the account", () => {
    expect(checkout).toContain("const newAccount = buyer.isNew ? \"true\" : \"false\";");
  });

  it("carries it on both kinds of intent", () => {
    // Written by us, read by us — the same way the price id travels, and for
    // the same reason: nothing the browser says can change it.
    expect(checkout.match(/newAccount,/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(offer).toContain('newAccount: args.isNewAccount ? "true" : "false"');
    expect(actions).toContain("isNewAccount: resolved.isNew");
  });

  it("refuses a session for an account that already existed", () => {
    // Both paths sign a first-time buyer in. Neither may sign in somebody who
    // simply typed an address that already had an account.
    for (const [name, src] of [
      ["product", post.slice(post.indexOf("export async function mintPostPurchaseLogin"), post.indexOf("export async function mintOfferLogin"))],
      ["offer", post.slice(post.indexOf("export async function mintOfferLogin"))],
    ] as const) {
      expect(src, `${name} sign-in checks newAccount`).toMatch(
        /metadata\?\.newAccount !== "true"\) return null;/,
      );
    }
  });

  it("checks it before minting anything", () => {
    // After would be a link already generated for an account that must not
    // have one.
    const mint = post.slice(post.indexOf("export async function mintOfferLogin"));
    expect(mint.indexOf('newAccount !== "true"')).toBeLessThan(mint.indexOf("generateLink"));
  });
});

describe("what the checkout reports when an address is typed", () => {
  const form = readFileSync("components/checkout/checkout-form.tsx", "utf8");
  const events = readFileSync("lib/analytics/events.ts", "utf8");

  it("is not called a Lead", () => {
    // A lead is somebody who asked to hear from you. This is somebody halfway
    // through paying, and the borrowed name taught the ad platform to optimise
    // for people who reach the email field rather than for people who pay.
    expect(form).not.toContain('track("Lead"');
  });

  it("says what it actually is", () => {
    expect(form).toContain('track("CheckoutEmailEntered"');
    expect(events).toContain('"CheckoutEmailEntered"');
  });

  it("goes to Meta under its own name, not a borrowed standard one", () => {
    // fbq('track') only accepts Meta's vocabulary; a custom name has to go
    // through trackCustom or it is dropped with a warning nobody reads.
    const custom = events.slice(events.indexOf("export const META_CUSTOM"));
    expect(custom).toContain("CheckoutEmailEntered");
  });

  it("carries no money, because nothing has been bought", () => {
    const noValue = events.slice(events.indexOf("export const NO_VALUE"));
    expect(noValue).toContain("CheckoutEmailEntered");
  });

  it("fires once per address, not once per blur", () => {
    expect(form).toContain("if (capturedEmail.current !== value) {");
  });

  it("still buffers the address for the abandoned-cart email", () => {
    expect(form).toContain("captureAbandonedCart(");
  });
});

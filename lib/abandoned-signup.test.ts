import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Trying again after a payment that did not go through.
 *
 * The account is created before the card is charged, so a decline, a closed
 * tab or a Stripe error leaves a real account behind that owns nothing. Coming
 * back and typing the same address then met "an account with this email exists
 * — please log in" — and there was nothing to log into: no password was ever
 * set and nothing was ever bought. A dead end at the moment of paying, caused
 * entirely by their own first attempt failing.
 *
 * The fix has to be narrow in one specific way, which is what this pins: an
 * account that owns something is a real customer, and a stranger typing their
 * address must not be able to continue as them.
 */

const checkout = readFileSync("lib/checkout.ts", "utf8");
const resume = checkout.slice(
  checkout.indexOf("async function resumeAbandonedSignup"),
  checkout.indexOf("export async function createCheckoutIntent"),
);

describe("resuming an abandoned signup", () => {
  it("is only reached when the address already exists", () => {
    expect(checkout).toMatch(/already\|exists\|registered[\s\S]{0,1400}resumeAbandonedSignup/);
  });

  it("refuses an account that owns anything", () => {
    // Cancelled does not count as owning — somebody whose subscription lapsed
    // and who never bought anything else is still an abandoned shell.
    expect(resume).toContain('.from("ownership")');
    expect(resume).toContain('.neq("status", "canceled")');
    expect(resume).toMatch(/if \(\(owns \?\? 0\) > 0\) return null;/);
  });

  it("refuses an account that has ever paid", () => {
    // Ownership can be revoked by hand; a paid order cannot be unpaid. Both
    // are checked because either one alone leaves a real customer reachable.
    expect(resume).toContain('.eq("status", "paid")');
    expect(resume).toMatch(/if \(\(paid \?\? 0\) > 0\) return null;/);
  });

  it("only ever returns an id, never a way in", () => {
    // It resolves who the buyer is for THIS purchase. It does not sign anybody
    // in, and it does not hand back a session or a token.
    expect(resume).not.toContain("generateLink");
    expect(resume).not.toContain("verifyOtp");
    expect(resume).not.toContain("createUser");
  });

  it("still refuses when the account is a real one", () => {
    // The message survives for the case it was written for.
    expect(checkout).toContain('code: "account_exists"');
    expect(checkout).toContain("An account with this email exists — please log in.");
  });
});

describe("what the checkout no longer reports", () => {
  const form = readFileSync("components/checkout/checkout-form.tsx", "utf8");

  it("fires no Lead event", () => {
    // Typing an address into a checkout is the middle of a purchase, not a
    // lead. Firing on every blur put three Leads in front of one buyer who was
    // about to send a Purchase, and taught the ad platform to optimise for
    // people who reach the email field rather than for people who pay.
    expect(form).not.toContain('track("Lead"');
  });

  it("still buffers the address for the abandoned-cart email", () => {
    // That is what the address is genuinely useful for, and it is untouched.
    expect(form).toContain("captureAbandonedCart(");
  });
});

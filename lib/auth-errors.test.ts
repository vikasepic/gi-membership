import { describe, it, expect } from "vitest";
import { authErrorMessage, isPasswordError } from "@/lib/auth-errors";

describe("authErrorMessage", () => {
  it("turns the OTP signup error into something a human can act on", () => {
    // The exact string that reached a customer. It is GoTrue's way of saying
    // "no account here", and it read as "the login is broken".
    const out = authErrorMessage("Signups not allowed for otp", "a@example.com");
    expect(out).not.toMatch(/otp|signup/i);
    expect(out).toContain("a@example.com");
  });

  it("names the address so a typo is visible", () => {
    expect(authErrorMessage("Signups not allowed for otp", "a@ajitnawalkha.com")).toContain(
      "a@ajitnawalkha.com",
    );
  });

  it("copes with no email to name", () => {
    expect(authErrorMessage("Signups not allowed for otp")).toContain("that address");
  });

  it("matches regardless of case or surrounding wording", () => {
    // GoTrue's phrasing shifts between versions; matching a substring
    // case-insensitively survives that, an equality check would not.
    expect(authErrorMessage("AuthApiError: Signups not allowed for OTP.")).toContain(
      "couldn't find an account",
    );
  });

  it("explains a wrong password and offers the way out", () => {
    const out = authErrorMessage("Invalid login credentials", "a@example.com");
    expect(out).toMatch(/don't match/);
    expect(out).toMatch(/link|reset/i);
  });

  it("passes unknown errors through rather than hiding them", () => {
    // A raw message is diagnosable; "something went wrong" throws away the
    // only clue anyone has.
    expect(authErrorMessage("Database is on fire", "a@example.com")).toBe("Database is on fire");
  });
});

describe("isPasswordError", () => {
  it("is true only for a credential mismatch", () => {
    expect(isPasswordError("Invalid login credentials")).toBe(true);
    expect(isPasswordError("Signups not allowed for otp")).toBe(false);
  });
});

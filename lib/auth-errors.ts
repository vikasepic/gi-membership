// GoTrue's error strings, rewritten for the person reading them.
//
// This exists because "Signups not allowed for otp" reached a real customer.
// It is accurate to the library and meaningless to a human: it is what GoTrue
// says when a login link is requested for an address that has no account,
// because we pass shouldCreateUser: false so a mistyped address can never
// quietly mint a second empty account.
//
// The cost of that phrasing was not cosmetic. The address had been added in
// admin with a typo, and the only signal anyone got was a sentence about
// signups and OTP — so the obvious reading was "the login is broken" rather
// than "that address does not exist here". The message now names the address,
// which makes a typo visible at a glance.

/** Matched as lowercase substrings — GoTrue wording shifts between versions. */
const MESSAGES: [needle: string, message: (email: string) => string][] = [
  [
    "signups not allowed",
    (e) =>
      `We couldn't find an account for ${e || "that address"}. Check the spelling — or if you bought under a different email, try that one.`,
  ],
  ["user not found", (e) => `We couldn't find an account for ${e || "that address"}.`],
  [
    "invalid login credentials",
    () => "That email and password don't match. Try a login link instead, or reset your password.",
  ],
  [
    "email not confirmed",
    () => "That account isn't confirmed yet. Use a login link and it will confirm itself.",
  ],
  [
    "email rate limit",
    () => "We've sent a few links to that address already. Give it a minute, then try again.",
  ],
  [
    "for security purposes",
    () => "Too many attempts just now. Wait a moment and try again.",
  ],
  ["over_email_send_rate_limit", () => "Too many links requested. Wait a moment and try again."],
];

/**
 * Plain-language text for a Supabase auth error.
 *
 * Unrecognised errors pass through unchanged rather than becoming "something
 * went wrong": a raw message is ugly but diagnosable, and a generic one throws
 * away the only clue anyone has.
 */
export function authErrorMessage(raw: string, email = ""): string {
  const hay = raw.toLowerCase();
  for (const [needle, message] of MESSAGES) {
    if (hay.includes(needle)) return message(email.trim());
  }
  return raw;
}

/** True when the failure is about the password specifically. */
export function isPasswordError(raw: string): boolean {
  return raw.toLowerCase().includes("invalid login credentials");
}

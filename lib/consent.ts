// Tracking runs for everyone. There is no banner and nothing to accept.
//
// This used to be a strict GDPR opt-in: nothing tracked until somebody clicked
// "accept", and the gate failed closed on silence. In production that meant
// roughly a third of paid orders reported NO conversion at all — not
// mis-attributed, absent — because most buyers simply ignored the banner. Ajit
// weighed that against the exposure on 11 Sep 2026 and chose coverage.
//
// The cookie survives as an OPT-OUT rather than an opt-in: an explicit
// "denied" still silences everything, so a visitor who asks not to be tracked
// can be honoured by setting it, without restoring the banner. Nothing in the
// UI writes that value today — it exists so honouring such a request is a
// cookie, not a deploy.

export const CONSENT_COOKIE = "gi_consent";
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

export type ConsentState = "granted" | "denied" | "unset";

export function parseConsent(raw: string | undefined | null): ConsentState {
  if (raw === "granted") return "granted";
  if (raw === "denied") return "denied";
  return "unset";
}

/**
 * Everyone except an explicit refusal.
 *
 * The inversion is the whole change: "unset" — which is almost every visitor,
 * since nothing asks any more — now means yes. Reading this as `=== "granted"`
 * is what took tracking to a third of its traffic.
 */
export function mayTrack(state: ConsentState): boolean {
  return state !== "denied";
}

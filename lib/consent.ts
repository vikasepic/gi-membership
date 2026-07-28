// Consent gate for tracking. The store takes EU/UK traffic, so GDPR applies:
// consent must be explicit opt-in, and declining must be as easy as accepting.
// Everything here fails CLOSED — anything other than an explicit "granted"
// means no tracking, no click-id capture, no personal data leaves the server.

export const CONSENT_COOKIE = "gi_consent";
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180; // 180 days, then re-ask

export type ConsentState = "granted" | "denied" | "unset";

export function parseConsent(raw: string | undefined | null): ConsentState {
  if (raw === "granted") return "granted";
  if (raw === "denied") return "denied";
  return "unset"; // missing or unrecognised — silence is not consent
}

export function mayTrack(state: ConsentState): boolean {
  return state === "granted";
}

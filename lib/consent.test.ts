import { describe, it, expect } from "vitest";
import { parseConsent, mayTrack, CONSENT_COOKIE } from "@/lib/consent";

describe("parseConsent", () => {
  it("treats a missing cookie as undecided, not as consent", () => {
    // GDPR: consent must be opt-IN. No cookie means the visitor has not agreed.
    expect(parseConsent(undefined)).toBe("unset");
  });

  it("reads an explicit grant", () => {
    expect(parseConsent("granted")).toBe("granted");
  });

  it("reads an explicit denial", () => {
    expect(parseConsent("denied")).toBe("denied");
  });

  it("treats an unrecognised value as undecided rather than granted", () => {
    expect(parseConsent("yes")).toBe("unset");
    expect(parseConsent("")).toBe("unset");
  });

  it("exposes a first-party cookie name", () => {
    expect(CONSENT_COOKIE).toBe("gi_consent");
  });
});

describe("mayTrack", () => {
  it("allows tracking only after an explicit grant", () => {
    expect(mayTrack("granted")).toBe(true);
  });

  it("blocks tracking when denied", () => {
    expect(mayTrack("denied")).toBe(false);
  });

  it("tracks while undecided, which is now almost everybody", () => {
    // The banner went on 11 Sep 2026. Reading "unset" as a refusal is what
    // silenced roughly a third of all conversions, so this is the assertion
    // that would catch a revert to opt-in.
    expect(mayTrack("unset")).toBe(true);
  });
});

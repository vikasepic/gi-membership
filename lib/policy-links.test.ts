import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SETTINGS_DEFAULTS } from "@/lib/settings-schema";

const shell = readFileSync("components/app-shell.tsx", "utf8");

/**
 * The footer's policy links.
 *
 * This store publishes its policies on its main site and maintains them there.
 * Two versions of a refund policy is one more than anybody can keep in step,
 * so the footer — the one place a buyer goes looking — points at the real ones.
 */
describe("the footer links to the published policies", () => {
  it("carries the store's own addresses by default", () => {
    expect(SETTINGS_DEFAULTS.termsUrl).toBe("https://greaterinside.com/terms-and-conditions/");
    expect(SETTINGS_DEFAULTS.privacyUrl).toBe("https://greaterinside.com/privacy-policy/");
    expect(SETTINGS_DEFAULTS.earningsUrl).toBe("https://greaterinside.com/earnings-disclaimer/");
  });

  it("falls back to the built-in page rather than a dead link", () => {
    // A store that names no external policy still needs a working footer.
    expect(shell).toContain('settings.termsUrl || "/terms"');
    expect(shell).toContain('settings.privacyUrl || "/privacy"');
  });

  it("always shows the earnings disclaimer, falling back to the published one", () => {
    // It replaced the refund link on 11 Sep 2026. This app renders no earnings
    // page, so a blank setting falls back to the address on the main site
    // rather than dropping the link or pointing at a 404.
    expect(shell).toContain("settings.earningsUrl || LEGAL_DEFAULTS.earningsUrl");
  });

  it("no longer offers a refund policy anywhere in the footer", () => {
    expect(shell).not.toContain("/refunds");
    expect(shell).not.toContain("Refunds");
  });

  it("opens an external policy as an external link", () => {
    expect(shell).toContain('rel="noopener noreferrer"');
  });
});

describe("the pages themselves are untouched", () => {
  it("still renders its own policies for anything linking to them", () => {
    // Only the footer moved. The checkout's disclosure line, and any page that
    // links to /terms directly, keeps working.
    for (const p of ["app/(store)/terms/page.tsx", "app/(store)/privacy/page.tsx"]) {
      expect(() => readFileSync(p, "utf8"), p).not.toThrow();
    }
  });
});

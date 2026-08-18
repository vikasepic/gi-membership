import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { hashed, nameParts } from "@/lib/tracking-fields";

/**
 * What a browser event can say about who it belongs to.
 *
 * Meta's coverage table for PageView told the story: IP, user agent and its own
 * browser id at 100% — because Meta fills those in itself — and everything that
 * identifies a PERSON near zero. Email 6%, first and last name 6%, external id
 * 51%. Not because the store did not know: it knew exactly who was reading and
 * initialised the pixel with a pixel id and nothing else.
 *
 * Advanced matching is that fix, and every part of it is a way to leak or to
 * silently fail, so each is pinned here.
 */

const analytics = readFileSync("components/analytics.tsx", "utf8");
const layout = readFileSync("app/(store)/layout.tsx", "utf8");
const match = readFileSync("lib/pixel-match.ts", "utf8");
const tracking = readFileSync("lib/tracking.ts", "utf8");

describe("what reaches the pixel", () => {
  it("rides on the init call, so every event carries it", () => {
    // Advanced matching is attached at init and applies to every event after.
    // Passing it per-event would mean remembering it at every call site.
    expect(analytics).toMatch(/fbq\('init','\$\{ids\.metaPixelId\}'\$\{match \?/);
  });

  it("initialises bare when there is nobody to describe", () => {
    // A signed-out reader with no cookie, or anybody who declined tracking.
    expect(analytics).toContain('match ? `,${JSON.stringify(match)}` : ""');
  });

  it("is hashed before it leaves the server", () => {
    // The pixel would hash raw values itself, but that puts the address in the
    // page and in the arguments of a third-party script. A sha256 Meta accepts
    // just as readily does not.
    expect(match).toContain("hashed(user.email)");
    expect(match).toContain("hashed(user.id)");
    expect(match).not.toMatch(/em:\s*user\.email/);
  });
});

describe("consent", () => {
  it("sends nothing at all without it", () => {
    // Not "loads the pixel and withholds the data" — returns null, so no hash
    // of anybody's address is even serialised into the page.
    expect(match).toMatch(/if \(!mayTrack\(parseConsent\([\s\S]{0,60}\)\)\) return null;/);
  });
});

describe("the external id", () => {
  it("is the same value the server sends", () => {
    // The entire point of an external id is that both sides agree on it. The
    // server sends hashed(userId) on conversions; anything else here would
    // describe two people.
    expect(match).toContain("external_id: hashed(user.id)");
    expect(tracking).toContain("external_id: hashed(e.userId)");
  });

  it("falls back to the anonymous cookie when signed out", () => {
    // Stable for a year, and it is what joins today's PageView to next week's
    // purchase. External id sat at 51%; a signed-out reader had none.
    expect(match).toContain('jar.get("gi_anon")');
    expect(match).toMatch(/return anonId \? \{ external_id: hashed\(anonId\) \}/);
  });
});

describe("it cannot take the store down", () => {
  it("survives a lookup that fails", () => {
    // A measurement call must cost a match rate, never a page.
    expect(layout).toContain("pixelMatch().catch(() => null)");
    expect(match.match(/catch/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("drops a field it has no answer for", () => {
    // An empty string is a value Meta tries to match and fails on, which is
    // worse than not sending the field.
    expect(match).toContain(".filter(([, v]) => v)");
  });
});

describe("the name split", () => {
  it("matches what the server does with the same name", () => {
    // Both sides run nameParts, so one person does not arrive as two.
    const { fn, ln } = nameParts("Ada Byron Lovelace");
    expect(fn).toBe(hashed("ada"));
    expect(ln).toBe(hashed("lovelace"));
    expect(match).toContain("nameParts(fullName)");
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

/**
 * The file Apple Pay depends on, and the ways it can quietly stop existing.
 *
 * Stripe verifies that this store may show Apple Pay by fetching
 * /.well-known/apple-developer-merchantid-domain-association. If that request
 * does not return the file, Apple Pay simply never appears — no error, no
 * warning, no entry in any log we keep. The button is just missing, and the
 * first sign is a conversion rate nobody can explain.
 *
 * Everything about it is fragile in a boring way: a directory whose name starts
 * with a dot, a file with no extension, and a middleware matcher that has to
 * keep excluding it. None of those break a build. So they are asserted here.
 */

const PATH = "public/.well-known/apple-developer-merchantid-domain-association";

describe("the Apple Pay domain association file", () => {
  it("is in the repo", () => {
    // A dot-directory under public/ is one .gitignore line away from never
    // being deployed, and nothing else in the build would notice.
    expect(existsSync(PATH), `${PATH} is missing`).toBe(true);
  });

  it("is the real thing rather than a placeholder", () => {
    const raw = readFileSync(PATH, "utf8").trim();
    // Hex, one line, no trailing newline games — Stripe serves it exactly so.
    expect(raw.length).toBeGreaterThan(1000);
    expect(/^[0-9a-fA-F]+$/.test(raw), "hex only").toBe(true);

    // It decodes to Apple's signed association payload. A truncated download
    // or an HTML error page saved by mistake fails here rather than at Apple.
    const decoded = Buffer.from(raw, "hex").toString("utf8");
    const parsed = JSON.parse(decoded) as { pspId?: string; signature?: string; version?: number };
    expect(parsed.pspId, "carries a payment service provider id").toBeTruthy();
    expect(parsed.signature, "carries a signature").toBeTruthy();
  });

  it("is not swallowed by the middleware", () => {
    // The matcher runs on everything it does not explicitly exclude. Stripe's
    // fetch carries no cookies and wants the file back and nothing else, so
    // the session refresh and the visitor cookie have no business on it.
    const mw = readFileSync("proxy.ts", "utf8");
    const matcher = mw.slice(mw.indexOf("matcher:"));
    expect(matcher).toContain("well-known");
  });
});

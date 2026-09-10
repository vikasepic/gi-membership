// lib/attribution-cookie.test.ts
import { describe, it, expect } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { applyAttributionCookie } from "@/lib/attribution-cookie";
import { UTM_COOKIE, UTM_KEYS, serializeCookie } from "@/lib/attribution";

const SITE = "http://localhost:3000";

function request(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, SITE), { headers });
}

const stored = (labels: Record<string, string>) =>
  serializeCookie({ f: labels, l: labels, fa: "2026-09-01T00:00:00.000Z", la: "2026-09-01T00:00:00.000Z" });

describe("the gi_utm cookie", () => {
  it("is written on a request carrying labels, httpOnly, for a year", () => {
    const req = request("/p/validator?utm_source=meta&utm_campaign=AJ%20%7C%20LAL&utm_adset=LAL%201%25");
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res, new Date("2026-09-10T00:00:00.000Z"))).toBe(true);
    const c = res.cookies.get(UTM_COOKIE)!;
    expect(c).toBeTruthy();
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("lax");
    expect(c.maxAge).toBe(60 * 60 * 24 * 365);
    expect(c.path).toBe("/");
    const parsed = JSON.parse(c.value);
    expect(parsed.f).toEqual({ utm_source: "meta", utm_campaign: "AJ | LAL", utm_adset: "LAL 1%" });
    expect(parsed.l).toEqual(parsed.f);
    expect(parsed.fa).toBe("2026-09-10T00:00:00.000Z");
  });

  it("is not written on a plain request with a cookie already", () => {
    const req = request("/p/validator", { cookie: `${UTM_COOKIE}=${encodeURIComponent(stored({ utm_source: "meta" }))}` });
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res)).toBe(false);
    expect(res.cookies.get(UTM_COOKIE)).toBeUndefined();
  });

  it("is not written when the same labels arrive again", () => {
    const req = request("/p/validator?utm_source=meta", {
      cookie: `${UTM_COOKIE}=${encodeURIComponent(stored({ utm_source: "meta" }))}`,
    });
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res)).toBe(false);
  });

  it("replaces last touch and keeps first touch on a different ad", () => {
    const req = request("/p/validator?utm_source=ig&utm_campaign=B", {
      cookie: `${UTM_COOKIE}=${encodeURIComponent(stored({ utm_source: "meta", utm_campaign: "A" }))}`,
    });
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res, new Date("2026-09-11T00:00:00.000Z"))).toBe(true);
    const parsed = JSON.parse(res.cookies.get(UTM_COOKIE)!.value);
    expect(parsed.f).toEqual({ utm_source: "meta", utm_campaign: "A" });
    expect(parsed.l).toEqual({ utm_source: "ig", utm_campaign: "B" });
    expect(parsed.la).toBe("2026-09-11T00:00:00.000Z");
  });

  it("writes a referrer-only record for a foreign landing with no labels and no cookie", () => {
    const req = request("/p/validator", { referer: "https://someblog.example/post?x=1" });
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res)).toBe(true);
    expect(JSON.parse(res.cookies.get(UTM_COOKIE)!.value)).toEqual({ r: "https://someblog.example/post" });
  });

  it("ignores our own pages as a referrer", () => {
    const req = request("/checkout", { referer: `${SITE}/p/validator` });
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res)).toBe(false);
  });

  it("treats a corrupt cookie as absent", () => {
    const req = request("/p/validator?utm_source=meta", { cookie: `${UTM_COOKIE}=%7Bnot-json` });
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res)).toBe(true);
    expect(JSON.parse(res.cookies.get(UTM_COOKIE)!.value).f).toEqual({ utm_source: "meta" });
  });

  it("drops first touch and the referrer, keeping last touch, when the encoded record is too big", () => {
    // MAX_LABEL (lib/attribution.ts) caps a label at 120 CHARACTERS, but Next
    // serializes the cookie with encodeURIComponent, which counts BYTES —
    // this store's real Meta campaign names ("AJ | LAL | Book Writer |
    // Sales | Sept 2026") are the pipe-and-space-heavy shape that grows once
    // encoded ("|" -> %7C, " " -> %20). Two full sets of seven such labels
    // (first touch already stored, last touch arriving now) blow well past
    // the budget; only the last-touch half needs to survive.
    const pipeHeavy = (tag: string) => `${tag}:${"| ".repeat(60)}`.slice(0, 120);
    const existingFirst = serializeCookie({
      f: Object.fromEntries(UTM_KEYS.map((k) => [k, pipeHeavy(`first-${k}`)])),
      l: Object.fromEntries(UTM_KEYS.map((k) => [k, pipeHeavy(`first-${k}`)])),
      fa: "2026-01-01T00:00:00.000Z",
      la: "2026-01-01T00:00:00.000Z",
      r: "https://someblog.example/a-reasonably-long-landing-path-to-pad-the-record-out-further-than-usual",
    });
    const params = new URLSearchParams();
    for (const k of UTM_KEYS) params.set(k, pipeHeavy(`last-${k}`));
    const req = request(`/p/validator?${params.toString()}`, {
      cookie: `${UTM_COOKIE}=${encodeURIComponent(existingFirst)}`,
    });
    const res = NextResponse.next();

    expect(applyAttributionCookie(req, res, new Date("2026-09-10T00:00:00.000Z"))).toBe(true);
    const cookie = res.cookies.get(UTM_COOKIE)!;
    // The written value itself has to actually be within the budget — the
    // whole point of the guard.
    expect(encodeURIComponent(cookie.value).length).toBeLessThanOrEqual(3800);
    const parsed = JSON.parse(cookie.value);
    expect(parsed.f).toBeUndefined();
    expect(parsed.r).toBeUndefined();
    expect(parsed.fa).toBeUndefined();
    expect(parsed.l.utm_source).toContain("last-utm_source");
    expect(parsed.la).toBe("2026-09-10T00:00:00.000Z");
  });

  it("writes nothing when even last touch alone is still over budget", () => {
    // MAX_LABEL truncates by CHARACTER count, not bytes. A label of 120
    // Devanagari characters is still one label under the cap, but each
    // character is 3 UTF-8 bytes and encodeURIComponent renders every byte
    // as %XX (3 characters) — a 9x blow-up that clears the budget on last
    // touch alone, with nothing left to drop.
    const wide = "अ".repeat(150); // truncated to 120 by sanitizeLabel; still ~1080 bytes encoded
    const params = new URLSearchParams();
    for (const k of UTM_KEYS) params.set(k, wide);
    const req = request(`/p/validator?${params.toString()}`);
    const res = NextResponse.next();

    expect(applyAttributionCookie(req, res)).toBe(false);
    expect(res.cookies.get(UTM_COOKIE)).toBeUndefined();
  });

  it("returns false instead of throwing when a request accessor explodes", () => {
    // A real NextRequest, with its `nextUrl` getter poisoned on this one
    // instance to throw — genuinely exercises the try/catch in
    // applyAttributionCookie rather than asserting on a hand-built stub.
    const req = request("/p/validator?utm_source=meta");
    Object.defineProperty(req, "nextUrl", {
      get() {
        throw new Error("boom");
      },
    });
    const res = NextResponse.next();
    expect(applyAttributionCookie(req, res)).toBe(false);
    expect(res.cookies.get(UTM_COOKIE)).toBeUndefined();
  });
});

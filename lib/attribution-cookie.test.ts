// lib/attribution-cookie.test.ts
import { describe, it, expect } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { applyAttributionCookie } from "@/lib/attribution-cookie";
import { UTM_COOKIE, serializeCookie } from "@/lib/attribution";

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

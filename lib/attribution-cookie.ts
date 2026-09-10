import type { NextRequest, NextResponse } from "next/server";
import {
  UTM_COOKIE,
  UTM_COOKIE_MAX_AGE,
  landingReferrer,
  mergeAttribution,
  parseCookie,
  parseLabels,
  serializeCookie,
} from "@/lib/attribution";

/**
 * Maintain the gi_utm cookie for this request.
 *
 * Its own file, not a block in proxy.ts, so it can be exercised with a bare
 * NextRequest and no Supabase session lookup in the way. The proxy calls it
 * beside gi_anon and does nothing clever itself.
 *
 * Returns whether a cookie was written. Most requests write nothing — that is
 * what keeps Set-Cookie off every page view after landing.
 */
export function applyAttributionCookie(req: NextRequest, res: NextResponse, now = new Date()): boolean {
  const labels = parseLabels(req.nextUrl.search);
  const stored = parseCookie(req.cookies.get(UTM_COOKIE)?.value);
  const referrer = landingReferrer(req.headers.get("referer"), process.env.NEXT_PUBLIC_SITE_URL);
  const next = mergeAttribution(stored, labels, referrer, now);
  if (!next) return false;
  res.cookies.set(UTM_COOKIE, serializeCookie(next), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: UTM_COOKIE_MAX_AGE,
    path: "/",
  });
  return true;
}

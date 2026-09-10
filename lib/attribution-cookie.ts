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
  // Every parse below already degrades on its own — but that guarantee lives
  // in lib/attribution.ts, a file this function does not control. This runs
  // on nearly every request, checkout included; one future edit there that
  // drops a try/catch would turn into a 500 on every page of a store that
  // takes money. So the guard lives here too, where every caller gets it,
  // present and future. Never log the caught error: it can carry a cookie
  // value.
  try {
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
  } catch {
    return false;
  }
}

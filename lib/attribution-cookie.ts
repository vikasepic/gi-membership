import type { NextRequest, NextResponse } from "next/server";
import {
  UTM_COOKIE,
  UTM_COOKIE_MAX_AGE,
  landingReferrer,
  mergeAttribution,
  parseCookie,
  parseLabels,
  serializeCookie,
  type StoredAttribution,
} from "@/lib/attribution";

/**
 * Wire-byte budget for the cookie value, comfortably under the browser's
 * 4096-byte name+value cap (leaving room for "gi_utm=" and the rest).
 *
 * `lib/attribution.ts`'s MAX_LABEL (120) caps each label in CHARACTERS, not
 * the bytes a browser actually counts. Next serializes a cookie value with
 * `encodeURIComponent`, so a pipe-heavy campaign name (this store's real Meta
 * campaigns look like "AJ | LAL | Book Writer | Sales | Sept 2026" — `|`
 * alone triples to `%7C`) or anything outside ASCII can turn a ~2.4 KB record
 * into 4.2+ KB on the wire. A cookie over 4096 bytes is not rejected loudly:
 * the browser drops the Set-Cookie silently, attribution never persists for
 * that visitor, and the proxy keeps re-sending the same oversized header on
 * every labelled request after. This guards rather than trusts that lib/
 * attribution.ts's character cap is enough — because it isn't.
 */
const COOKIE_BYTE_BUDGET = 3800;

/**
 * The value to write, degraded to fit the byte budget, or null to skip the
 * write entirely.
 *
 * Never throws: `encodeURIComponent` can throw on a lone UTF-16 surrogate,
 * and a guard that exists to catch an oversized cookie must not itself
 * become a new way to fail on a page that takes money.
 */
function cookieValueWithinBudget(next: StoredAttribution): string | null {
  try {
    const full = serializeCookie(next);
    if (encodeURIComponent(full).length <= COOKIE_BYTE_BUDGET) return full;

    // Over budget: drop first touch and the referrer. Last touch is what the
    // ads team attributes on, so it is what survives the squeeze.
    const trimmed = serializeCookie({ l: next.l, la: next.la });
    if (encodeURIComponent(trimmed).length <= COOKIE_BYTE_BUDGET) return trimmed;

    // Even last touch alone is too big. Nothing persists rather than a
    // cookie the browser silently drops.
    return null;
  } catch {
    return null;
  }
}

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
    const value = cookieValueWithinBudget(next);
    if (!value) return false;
    res.cookies.set(UTM_COOKIE, value, {
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

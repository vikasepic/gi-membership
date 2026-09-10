// lib/attribution.ts
/**
 * Where a buyer came from, as the ads team labels it.
 *
 * Pure: no Next, no Supabase, no `server-only`, so the proxy, the client
 * tracker, the checkout and the tests all read the same rules.
 *
 * Labels describe the ad, not the person, so they are captured for everyone
 * — the consent gate stays on click ids, IP and user agent, which is where it
 * belongs. The one guard kept is `@`: several ESPs build per-recipient links,
 * and `utm_campaign=jane@example.com` names a person.
 *
 * Both first touch and last touch are kept. First is the ad that brought
 * them; last is the one they clicked most recently before buying, which is
 * what Ads Manager attributes to. Storing both costs a few bytes and answers
 * either question later without a rebuild.
 */

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_adset",
  "utm_content",
  "utm_term",
  "utm_id",
] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type Labels = Partial<Record<UtmKey, string>>;

export type Attribution = { first: Labels; last: Labels; referrer: string | null };
export const EMPTY_ATTRIBUTION: Attribution = { first: {}, last: {}, referrer: null };

export const UTM_COOKIE = "gi_utm";
/** A year, the same as gi_anon. */
export const UTM_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Long enough for Meta's `{{campaign.name}}`, short enough that seven of
 *  them twice over plus a referrer stay well under the 4 KB cookie limit. */
const MAX_LABEL = 120;
const MAX_REFERRER = 200;

/**
 * What the cookie holds. Short keys on purpose: this rides on every request
 * for a year. `f` first touch, `l` last touch, `fa`/`la` when each was seen,
 * `r` the landing referrer.
 */
export type StoredAttribution = { f?: Labels; l?: Labels; fa?: string; la?: string; r?: string };

export function parseLabels(search: string): Labels {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    // A query that cannot be parsed is not a reason to fail a page render.
    return {};
  }
  const out: Labels = {};
  for (const k of UTM_KEYS) {
    const raw = params.get(k);
    if (raw == null) continue;
    const v = raw.trim().slice(0, MAX_LABEL);
    // The @ is refused before anything else, and that order is the point:
    // cleaning first would turn this guard into decoration.
    if (!v || v.includes("@")) continue;
    out[k] = v;
  }
  return out;
}

/**
 * The page that sent them, if it was not one of ours.
 *
 * Origin and path only. A referrer's query can carry an identifier (a
 * per-recipient token, a session id), and this is stored for everyone.
 */
export function landingReferrer(
  referer: string | null | undefined,
  siteUrl: string | undefined,
): string | null {
  const ref = (referer ?? "").trim();
  if (!ref) return null;
  try {
    const u = new URL(ref);
    if (siteUrl && u.hostname === new URL(siteUrl).hostname) return null;
    return `${u.origin}${u.pathname}`.slice(0, MAX_REFERRER);
  } catch {
    return null;
  }
}

export function parseCookie(raw: string | null | undefined): StoredAttribution | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const s = v as Record<string, unknown>;
    const labels = (x: unknown): Labels | undefined => {
      if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
      const out: Labels = {};
      for (const k of UTM_KEYS) {
        const val = (x as Record<string, unknown>)[k];
        if (typeof val === "string" && val) out[k] = val.slice(0, MAX_LABEL);
      }
      return out;
    };
    const str = (x: unknown): string | undefined => (typeof x === "string" && x ? x : undefined);
    return {
      f: labels(s.f),
      l: labels(s.l),
      fa: str(s.fa),
      la: str(s.la),
      r: str(s.r)?.slice(0, MAX_REFERRER),
    };
  } catch {
    // An unparseable cookie is an absent one. Never an error on a page render.
    return null;
  }
}

export function hasLabels(l: Labels | undefined): boolean {
  return !!l && Object.keys(l).length > 0;
}

/** Same keys in UTM_KEYS order with the same values. Both parsers emit that order. */
export function sameLabels(a: Labels | undefined, b: Labels | undefined): boolean {
  return UTM_KEYS.every((k) => (a?.[k] ?? "") === (b?.[k] ?? ""));
}

/**
 * The record to store after this request, or null when nothing should be
 * written — which is most requests, and is what keeps `Set-Cookie` off every
 * page view after landing.
 *
 * Rules:
 * - labels, no first touch stored yet → first and last are both this set;
 *   a referrer already stored is kept, else the landing one is taken;
 * - labels, first stored → last is replaced unless it is the same set;
 * - no labels, no cookie, foreign referrer → a referrer-only record;
 * - anything else → nothing.
 */
export function mergeAttribution(
  existing: StoredAttribution | null,
  labels: Labels,
  referrer: string | null,
  now: Date,
): StoredAttribution | null {
  const at = now.toISOString();
  if (hasLabels(labels)) {
    if (!existing || !hasLabels(existing.f)) {
      const r = existing?.r ?? referrer ?? undefined;
      return { f: labels, l: labels, fa: at, la: at, ...(r ? { r } : {}) };
    }
    if (sameLabels(existing.l, labels)) return null;
    return { ...existing, l: labels, la: at };
  }
  if (!existing && referrer) return { r: referrer };
  return null;
}

/** Next encodes cookie values itself (encodeURIComponent), so this is plain JSON. */
export function serializeCookie(s: StoredAttribution): string {
  return JSON.stringify(s);
}

export function attributionOf(s: StoredAttribution | null): Attribution {
  return { first: s?.f ?? {}, last: s?.l ?? {}, referrer: s?.r ?? null };
}

export function attributionFromCookie(raw: string | null | undefined): Attribution {
  return attributionOf(parseCookie(raw));
}

/**
 * The labels as Stripe metadata: `utm_*` for last touch, `first_utm_*` for
 * first, `referrer`. Only keys with a value, so an organic sale adds nothing.
 * Spread AFTER a bag's existing keys; nothing in the store uses these names.
 */
export function stripeAttributionMetadata(a: Attribution | null | undefined): Record<string, string> {
  if (!a) return {};
  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) if (a.last[k]) out[k] = a.last[k]!;
  for (const k of UTM_KEYS) if (a.first[k]) out[`first_${k}`] = a.first[k]!;
  if (a.referrer) out.referrer = a.referrer;
  return out;
}

/** The reverse, for the offer checkout: completion runs from the webhook too, where there is no cookie. */
export function attributionFromMetadata(md: Record<string, string> | null | undefined): Attribution {
  const first: Labels = {};
  const last: Labels = {};
  for (const k of UTM_KEYS) {
    if (md?.[k]) last[k] = md[k];
    if (md?.[`first_${k}`]) first[k] = md[`first_${k}`];
  }
  return { first, last, referrer: md?.referrer || null };
}

/** The three `orders` columns (migration 0079), for an insert. */
export function orderAttributionColumns(
  a: Attribution | null | undefined,
): { utm_first: Labels; utm_last: Labels; referrer: string | null } {
  return { utm_first: a?.first ?? {}, utm_last: a?.last ?? {}, referrer: a?.referrer ?? null };
}

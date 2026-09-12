import { createHash } from "node:crypto";

/**
 * The user_data Meta matches on, built from what the store already knows.
 *
 * Client-safe on purpose — no "server-only" — because the relay endpoint and
 * its tests both need the same normalisation, and a second copy of "lowercase
 * it before you hash it" is how match rates quietly halve.
 *
 * Every value here is hashed before it leaves except the three Meta requires
 * in the clear: the IP, the user agent, and the two click cookies. Those are
 * identifiers Meta issued itself, so hashing them would make them unmatchable.
 */

/** sha256 of the trimmed, lowercased value — the normalisation every platform expects. */
export function hashed(value: string | null | undefined): string | undefined {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return undefined;
  return createHash("sha256").update(v).digest("hex");
}

/**
 * A full name split the way Meta wants it: first and last, hashed separately.
 *
 * Everything between the first and last word is dropped rather than guessed at
 * — a middle name in the `ln` field matches nobody, and matching nobody is the
 * outcome this exists to avoid.
 */
export function nameParts(fullName: string | null | undefined): { fn?: string; ln?: string } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { fn: hashed(parts[0]) };
  return { fn: hashed(parts[0]), ln: hashed(parts[parts.length - 1]) };
}

/**
 * Meta's click id, in the format Meta actually accepts.
 *
 * `fbc` is NOT the fbclid. It is `fb.<subdomain-index>.<click-time-ms>.<fbclid>`,
 * and Meta discards anything else — so sending the bare fbclid, which is what
 * this store did, threw away the click attribution on every paid conversion
 * while looking for all the world like it was being sent.
 *
 * The cookie wins where there is one: the pixel writes `_fbc` itself and its
 * value is authoritative, including the click time. Only when there is no
 * cookie — an ad click that landed before consent, or a blocked pixel — is one
 * built from the fbclid, and then the click time is the best we have rather
 * than the truth.
 */
export function fbcFrom(clickIds: Record<string, string>, clickTimeMs?: number): string | undefined {
  const cookie = clickIds.fbc?.trim();
  if (cookie) return cookie;
  const fbclid = clickIds.fbclid?.trim();
  if (!fbclid) return undefined;
  return `fb.1.${Math.floor(clickTimeMs ?? Date.now())}.${fbclid}`;
}

/** The browser id Meta's own pixel sets. Passed through untouched or not at all. */
export function fbpFrom(clickIds: Record<string, string>): string | undefined {
  return clickIds.fbp?.trim() || undefined;
}

/**
 * A two-letter country, lowercased and hashed.
 *
 * Meta wants ISO-3166-1 alpha-2. Anything else is refused, so a stored value
 * that is not two letters is dropped rather than sent and silently ignored.
 */
export function countryHash(country: string | null | undefined): string | undefined {
  const v = (country ?? "").trim().toLowerCase();
  return /^[a-z]{2}$/.test(v) ? hashed(v) : undefined;
}

/** Drops every key whose value is undefined, so no empty field is ever posted. */
export function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Partial<T>;
}

/**
 * Who an event belongs to, in the terms the BROWSER pixel already uses.
 *
 * `pixelMatch` initialises the pixel with `external_id = hashed(user.id)` for a
 * signed-in reader and `hashed(anon)` for everyone else, and that value then
 * rides every browser event. A server copy that picks a different value, or
 * none, leaves the pair matched on one side only — which is exactly what Meta
 * reported as 44% External ID coverage on AddToCart.
 *
 * So the rule is not "send an id", it is "send THE SAME id". The anonymous
 * cookie is a real, stable identifier and is the right answer for a reader who
 * has not signed in; it is never a fallback to something weaker.
 *
 * The address follows the same logic with one exception: the body wins, because
 * a checkout knows the address the reader just typed before the account does.
 */
export function matchIdentity(
  user: { id: string; email?: string | null } | null,
  anon: string | undefined,
  bodyEmail: string | undefined,
): { userId: string | undefined; email: string } {
  if (!user) return { userId: anon, email: bodyEmail ?? "" };
  return { userId: user.id, email: bodyEmail || user.email || "" };
}

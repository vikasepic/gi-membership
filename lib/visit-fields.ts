// lib/visit-fields.ts
import { createHash } from "node:crypto";

/**
 * What a request says about itself, reduced to something worth storing.
 *
 * Pure: no Next, no Supabase, no `server-only`, so the capture path and the
 * tests read the same rules. Everything here is a best effort over a string
 * the client controls — a wrong guess costs a column in a report, so each
 * function has an honest "Other" rather than an invented answer.
 */

const MAX_URLISH = 500;

export type Device = "phone" | "tablet" | "desktop";

/**
 * Phone, tablet or desktop.
 *
 * `Mobile` is the token every phone browser sends and tablets deliberately
 * omit — that absence is the whole signal for an Android tablet, which is
 * otherwise identical to a phone.
 */
export function deviceOf(ua: string | null | undefined): Device {
  const s = ua ?? "";
  if (/iPad|Tablet/i.test(s)) return "tablet";
  if (/Android/i.test(s) && !/Mobile/i.test(s)) return "tablet";
  if (/Mobile|iPhone|iPod|Android/i.test(s)) return "phone";
  return "desktop";
}

/**
 * Order matters and is the only hard part. Edge and Samsung Internet both
 * carry `Chrome` in their strings, and Chrome carries `Safari` in its — so
 * the most specific claim has to be tested first or everything reads Chrome.
 */
export function browserOf(ua: string | null | undefined): string {
  const s = ua ?? "";
  if (/Edg\//i.test(s)) return "Edge";
  if (/SamsungBrowser/i.test(s)) return "Samsung Internet";
  if (/Firefox\/|FxiOS/i.test(s)) return "Firefox";
  if (/Chrome\/|CriOS/i.test(s)) return "Chrome";
  if (/Safari\//i.test(s)) return "Safari";
  return "Other";
}

/** Android says Linux, so it has to be asked about first. */
export function osOf(ua: string | null | undefined): string {
  const s = ua ?? "";
  if (/Android/i.test(s)) return "Android";
  if (/iPhone|iPad|iPod|iOS/i.test(s)) return "iOS";
  if (/Mac OS X|Macintosh/i.test(s)) return "macOS";
  if (/Windows/i.test(s)) return "Windows";
  if (/Linux|X11/i.test(s)) return "Linux";
  return "Other";
}

/** A value that names a person. Same guard the campaign labels use. */
const namesAPerson = (v: string) => v.includes("@");

/**
 * The landing query, kept as the link actually was.
 *
 * Click ids stay: this column exists to answer "what exactly did they
 * click", and a landing URL with `fbclid` removed answers half of it. What
 * does not stay is a value carrying an address — ESP links build
 * per-recipient URLs, and one of those in an exported column is a leak.
 */
export function sanitizeQuery(search: string | null | undefined): string | null {
  const raw = (search ?? "").replace(/^\?/, "");
  if (!raw) return null;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return null;
  }
  const kept = new URLSearchParams();
  for (const [k, v] of params) {
    if (!v || namesAPerson(v)) continue;
    kept.append(k, v);
  }
  const out = kept.toString();
  return out ? out.slice(0, MAX_URLISH) : null;
}

/**
 * The referring page, when it was not one of ours.
 *
 * Kept whole, query included, unlike `orders.referrer` which is origin plus
 * path: the visit log is where somebody goes to ask what exactly this was,
 * and the referring page's own query is part of that answer. An internal
 * move — sales page to checkout — is not a referral and is dropped, or every
 * navigation in the store would look like incoming traffic.
 */
export function foreignReferrer(
  referer: string | null | undefined,
  siteUrl: string | undefined,
): { url: string; host: string } | null {
  const ref = (referer ?? "").trim();
  if (!ref || namesAPerson(ref)) return null;
  try {
    const u = new URL(ref);
    if (siteUrl && u.hostname === new URL(siteUrl).hostname) return null;
    return { url: ref.slice(0, MAX_URLISH), host: u.hostname };
  } catch {
    return null;
  }
}

/**
 * The address, as something that cannot be turned back into an address.
 *
 * Null without a salt rather than a bare hash: an unsalted sha256 of an IPv4
 * is reversible by brute force in seconds, so a missing secret must mean no
 * column, never a weaker one.
 */
export function hashIp(ip: string | null | undefined, salt: string | undefined): string | null {
  const v = (ip ?? "").trim();
  if (!v || !salt) return null;
  return createHash("sha256").update(`${salt}:${v}`).digest("hex");
}

/** `x-forwarded-for` is a list; the first entry is the client, the rest are proxies. */
export function clientIpOf(forwardedFor: string | null, realIp: string | null): string | null {
  const first = (forwardedFor ?? "").split(",")[0]?.trim();
  if (first) return first;
  const real = (realIp ?? "").trim();
  return real || null;
}

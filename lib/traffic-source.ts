/**
 * Where a visit came from, in one word.
 *
 * No database, no request object, no `server-only` — pure input to output, so
 * it can be tested exhaustively and read at a glance. The rules are ordered on
 * purpose: a UTM is a label somebody chose and beats anything inferred from a
 * click id or a referrer.
 */

/** Long enough for a real campaign name, short enough not to store an essay. */
const MAX_SOURCE = 60;

/**
 * What a campaign name is allowed to look like.
 *
 * `source` is the one column in page_counts that could carry an identifier,
 * and the table's whole defensibility is that it holds none. A mailer that
 * builds per-recipient links — `utm_campaign=jane@example.com`, which several
 * ESPs do by default — would otherwise write a person into it. Anything
 * outside this charset is treated as no campaign at all rather than stored.
 *
 * It also bounds cardinality: `path` can only be a slug that resolves, but
 * `source` was free text, so a loop over random campaign values could add a
 * row per request per day forever.
 */
const CAMPAIGN = /^[a-z0-9][a-z0-9._-]{0,59}$/i;

export function sourceOf(search: string, referrer: string | null): string {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    // A query that cannot be parsed is not a reason to fail a page render.
    params = new URLSearchParams();
  }

  const utm = params.get("utm_campaign")?.trim();
  if (utm) {
    const capped = utm.slice(0, MAX_SOURCE);
    if (CAMPAIGN.test(capped)) return capped;
  }
  if (params.get("fbclid")) return "meta";
  if (params.get("gclid")) return "google";

  const ref = (referrer ?? "").trim();
  if (!ref) return "direct";

  // Our own pages are not a referrer. Somebody moving from the sales page to
  // the checkout is the same visit, and counting it as new traffic would
  // credit the store with referring itself.
  try {
    const host = new URL(ref).hostname;
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (site && host === new URL(site).hostname) return "direct";
  } catch {
    return "direct";
  }
  return "referral";
}

/**
 * Obvious robots.
 *
 * A short explicit list, not a dependency. It will miss some, and that is
 * accepted: the goal is removing the obvious inflation, not perfect
 * discrimination — a filter that grows into a maintained bot database is a
 * second product.
 */
const BOTS = [
  "bot", "crawl", "spider", "slurp", "preview", "headless",
  "facebookexternalhit", "slackbot", "whatsapp", "telegram",
  "python-requests", "curl/", "wget", "axios", "go-http-client",
];

export function isBot(userAgent: string | null): boolean {
  const ua = (userAgent ?? "").toLowerCase();
  // Every real browser sends one. Something that does not is not a person.
  if (!ua) return true;
  return BOTS.some((b) => ua.includes(b));
}

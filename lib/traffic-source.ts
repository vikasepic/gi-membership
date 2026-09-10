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
 * A campaign name, reduced to something safe to store as a bucket label.
 *
 * `source` is the one column in page_counts that could carry an identifier,
 * and the table's whole defensibility is that it holds none. So this cleans
 * what it can and refuses what it cannot.
 *
 * **The @ is refused before any cleaning, and that order is the point.**
 * Several ESPs build per-recipient links — `utm_campaign=jane@example.com` —
 * and slugifying one produces `jane-example-com`, which passes every charset
 * rule and still names a person. Cleaning first would turn this guard into
 * decoration.
 *
 * Everything else is lowercased and reduced to `[a-z0-9._-]`, because the
 * alternative was refusing it. Meta's `{{campaign.name}}` expands to things
 * like `AJ | Product Validator | Sales`, and a rule that rejected spaces sent
 * every campaign to the `meta` bucket instead — tracking that looked like it
 * worked and answered none of the questions it existed for. Lowercasing also
 * means one campaign is one row however somebody typed it.
 *
 * The 60-character cap bounds cardinality: `path` can only be a slug that
 * resolved to a real row, but this is free text, so without a cap a loop over
 * random values could add a row per request per day forever.
 */
function campaignSlug(raw: string): string | null {
  if (raw.includes("@")) return null;
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-._]+/, "")
    .slice(0, MAX_SOURCE)
    .replace(/[-._]+$/, "");
  // Must still begin with something meaningful — a value that cleaned down to
  // nothing is not a campaign, it is punctuation.
  return /^[a-z0-9]/.test(slug) ? slug : null;
}

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
    const slug = campaignSlug(utm);
    if (slug) return slug;
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

const META_SOURCES = new Set(["fb", "ig", "meta", "facebook", "instagram"]);
const GOOGLE_SOURCES = new Set(["google", "adwords"]);

/**
 * Where an ORDER came from, in the same words `sourceOf` uses for a view.
 *
 * Same `campaignSlug`, same order of preference, so a campaign's views and
 * its sales land in one bucket and the Bought step under a source filter is
 * that source's own number. A view has click ids and an order does not, so
 * the Meta/Google fold reads utm_source instead: `fb`, `ig` and `meta` are
 * the names the ads team's own templates have used.
 */
export function sourceOfOrder(
  utmLast: Partial<Record<string, string>> | null | undefined,
  referrer: string | null | undefined,
): string {
  const campaign = utmLast?.utm_campaign?.trim();
  if (campaign) {
    const slug = campaignSlug(campaign);
    if (slug) return slug;
  }
  const source = utmLast?.utm_source?.trim().toLowerCase();
  if (source) {
    if (META_SOURCES.has(source)) return "meta";
    if (GOOGLE_SOURCES.has(source)) return "google";
    const slug = campaignSlug(source);
    if (slug) return slug;
  }
  const ref = (referrer ?? "").trim();
  if (!ref) return "direct";
  try {
    const host = new URL(ref).hostname;
    const site = process.env.NEXT_PUBLIC_SITE_URL;
    if (site && host === new URL(site).hostname) return "direct";
  } catch {
    return "direct";
  }
  return "referral";
}

/**
 * Where a visit came from, in one word.
 *
 * No database, no request object, no `server-only` — pure input to output, so
 * it can be tested exhaustively and read at a glance. The rules are ordered on
 * purpose: a UTM is a label somebody chose and beats anything inferred from a
 * click id or a referrer, and between the two UTM fields the campaign (a
 * specific ad) beats the source (a channel). A page VIEW and the ORDER it
 * produces are bucketed through the same ranking — `bucketOf` below is the
 * one place that ranking lives, so `sourceOf` and `sourceOfOrder` cannot
 * drift apart the way they once did.
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

/** The ads team's own names for themselves, folded to one bucket each. */
const META_SOURCES = new Set(["fb", "ig", "meta", "facebook", "instagram"]);
const GOOGLE_SOURCES = new Set(["google", "adwords"]);

/** The fields either kind of visit — a view or an order — can supply. */
type Visit = {
  campaign?: string | null;
  source?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  referrer?: string | null;
};

/**
 * The shared ranking `sourceOf` and `sourceOfOrder` both bucket through:
 * `utm_campaign` beats `utm_source` (folded through the same Meta/Google
 * names above) beats a click id beats a referrer beats `direct`. A click id
 * only ever exists on a view — an order is created after the click, not
 * during it — so it ranks below either UTM field but is still read before
 * falling through to the referrer.
 *
 * Kept private and shape-agnostic on purpose: `sourceOf` pulls these five
 * fields out of a query string, `sourceOfOrder` out of `utm_last`. This is
 * the one place the actual decision lives, so a VIEW and the ORDER it
 * produces cannot land in different buckets because the two exported
 * functions quietly grew different rules.
 */
function bucketOf({ campaign, source, fbclid, gclid, referrer }: Visit): string {
  const trimmedCampaign = campaign?.trim();
  if (trimmedCampaign) {
    const slug = campaignSlug(trimmedCampaign);
    if (slug) return slug;
  }

  const trimmedSource = source?.trim().toLowerCase();
  if (trimmedSource) {
    if (META_SOURCES.has(trimmedSource)) return "meta";
    if (GOOGLE_SOURCES.has(trimmedSource)) return "google";
    const slug = campaignSlug(trimmedSource);
    if (slug) return slug;
  }

  if (fbclid) return "meta";
  if (gclid) return "google";

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

export function sourceOf(search: string, referrer: string | null): string {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    // A query that cannot be parsed is not a reason to fail a page render.
    params = new URLSearchParams();
  }

  return bucketOf({
    campaign: params.get("utm_campaign"),
    source: params.get("utm_source"),
    fbclid: params.get("fbclid"),
    gclid: params.get("gclid"),
    referrer,
  });
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

/**
 * Where an ORDER came from, in the same bucket the matching VIEW landed in —
 * see `bucketOf` above for the shared ranking. An order carries no click id
 * (it is created after the click, not during it), so only `utm_last`'s two
 * UTM fields and the referrer feed in.
 */
export function sourceOfOrder(
  utmLast: Partial<Record<string, string>> | null | undefined,
  referrer: string | null | undefined,
): string {
  return bucketOf({
    campaign: utmLast?.utm_campaign,
    source: utmLast?.utm_source,
    referrer,
  });
}

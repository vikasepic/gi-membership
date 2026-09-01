/**
 * What a save did, said out loud.
 *
 * Three ways a save could fail silently before this existed:
 *
 *  1. A required field on a hidden tab. The browser refuses to submit a form
 *     with an invalid control it cannot focus, and reports it only to the
 *     console — so the button does nothing, forever, with no explanation.
 *  2. A field error rendered inside the panel it belongs to. Press Save on
 *     Basics with no price and the message appears on Pricing, which you are
 *     not looking at.
 *  3. No success state at all. "Unsaved" stayed on screen after a save worked,
 *     which is indistinguishable from a save that did not.
 *
 * These are the parts that can be reasoned about without a browser.
 */

/** Which tab holds which field. Anything unlisted is assumed to be on the first. */
export type FieldTabs = Record<string, string>;

export const PRODUCT_FIELD_TABS: FieldTabs = {
  title: "basics",
  slug: "basics",
  tagline: "basics",
  description: "basics",
  status: "basics",
  cover: "basics",
  price: "pricing",
  compareAt: "pricing",
  courseIds: "content",
  bumpOfferId: "funnel",
  upsellOfferId: "funnel",
  activecampaignTagId: "marketing",
  activecampaignAbandonedTagId: "marketing",
  adEventName: "marketing",
};

export const OFFER_FIELD_TABS: FieldTabs = {
  name: "basics",
  key: "basics",
  grantType: "grants",
  grantProductId: "grants",
  grantAppId: "grants",
  grantEntitlementKey: "grants",
  billingType: "pricing",
  interval: "pricing",
  trialDays: "pricing",
  price: "pricing",
  compareAt: "pricing",
  currency: "pricing",
  headline: "copy",
  description: "copy",
  bullets: "copy",
  acceptLabel: "copy",
  declineLabel: "copy",
  otoTemplate: "copy",
};

/**
 * The tab to move to, or null to stay put.
 *
 * Null when an error is already on screen: yanking someone to another tab to
 * show them a message they can already see is a page that moves under them for
 * no reason.
 */
export function tabToShow(
  errors: Record<string, string> | undefined,
  tabs: FieldTabs,
  active: string,
  fallback: string,
): string | null {
  const fields = Object.keys(errors ?? {}).filter((k) => errors?.[k]);
  if (fields.length === 0) return null;
  const onActive = fields.some((f) => (tabs[f] ?? fallback) === active);
  if (onActive) return null;
  return tabs[fields[0]] ?? fallback;
}

/** Which tabs are holding a problem, for the dot on the tab. */
export function tabsWithErrors(
  errors: Record<string, string> | undefined,
  tabs: FieldTabs,
  fallback: string,
): Set<string> {
  const out = new Set<string>();
  for (const [field, message] of Object.entries(errors ?? {})) {
    if (!message) continue;
    // `_form` is the whole form's problem, not one tab's.
    if (field.startsWith("_")) continue;
    out.add(tabs[field] ?? fallback);
  }
  return out;
}

const NAMES: Record<string, string> = {
  title: "Title",
  slug: "Slug",
  price: "Price",
  compareAt: "Compare-at price",
  courseIds: "Course",
  status: "Status",
  name: "Name",
  key: "Key",
  headline: "Headline",
  cover: "Cover image",
};

/**
 * One line saying what is wrong and where.
 *
 * Names the fields rather than counting them: "2 problems" sends you looking,
 * "Title and Price need fixing" tells you what to fix.
 */
export function summarise(errors: Record<string, string> | undefined): string | null {
  const fields = Object.entries(errors ?? {}).filter(([, m]) => m);
  if (fields.length === 0) return null;

  const form = fields.find(([k]) => k.startsWith("_"));
  if (form) return form[1];

  const labels = fields.map(([k]) => NAMES[k] ?? k);
  if (labels.length === 1) return `${labels[0]} needs fixing`;
  const last = labels.pop();
  return `${labels.join(", ")} and ${last} need fixing`;
}

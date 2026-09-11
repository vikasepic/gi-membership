/**
 * Telling a Meta object id from a campaign name.
 *
 * Pure and client-safe on purpose: the admin's label rendering is a client
 * component, and putting this in a `server-only` module is what broke the build
 * the last time something needed to be shared across that boundary.
 *
 * Meta's ids are long decimal strings — the ones this account emits are 18
 * digits. A real campaign name could in principle be all digits, so the floor
 * is deliberately high: 15 digits is far past any name anybody types, and a
 * short numeric name is left alone rather than hidden behind a lookup miss.
 */
export function isMetaId(value: string): boolean {
  return /^\d{15,20}$/.test(value.trim());
}

/**
 * The name for a label value, or the value unchanged.
 *
 * Anything that is not an id passes straight through, so a campaign already
 * sending a real name is never touched — which is most of what makes this safe
 * to apply to every label everywhere.
 */
export function namedLabel(value: string, names: Record<string, string>): string {
  if (!isMetaId(value)) return value;
  return names[value.trim()] ?? value;
}

/**
 * The label keys that carry a Meta object id under Meta's default ad URLs:
 * campaign, ad set (which Meta puts in utm_term), and the ad itself.
 */
const NAMEABLE = ["utm_campaign", "utm_adset", "utm_content", "utm_term"] as const;

/**
 * `utm_campaign_name` and friends, for Stripe metadata.
 *
 * ADDED alongside the raw ids, never replacing them. The ads team's other
 * platform reads the id keys, so rewriting `utm_campaign` in place would fix
 * one reader by breaking another. A `_name` key appears only when the raw value
 * was an id AND we know what it is called — so a campaign already sending a
 * real name produces nothing here, which is right: the name is already in
 * `utm_campaign`.
 */
export function nameMetadata(
  labels: Record<string, string>,
  names: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of NAMEABLE) {
    const raw = labels[k]?.trim();
    if (!raw || !isMetaId(raw)) continue;
    const name = names[raw];
    if (name) out[`${k}_name`] = name;
  }
  return out;
}

/** The same, across a whole label set. */
export function namedLabels(
  labels: Record<string, string>,
  names: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(labels)) out[k] = namedLabel(v, names);
  return out;
}

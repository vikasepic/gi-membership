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

/** The same, across a whole label set. */
export function namedLabels(
  labels: Record<string, string>,
  names: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(labels)) out[k] = namedLabel(v, names);
  return out;
}

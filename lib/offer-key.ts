/**
 * What an offer's public link is allowed to be.
 *
 * The key IS the address — `/o/<key>` — so this is the one field on an offer
 * whose value a stranger types. Pure input to output, and shared by both places
 * that write it: the main offer form and the link editor on the page builder.
 * A second copy of this rule would be a second place for it to be subtly
 * weaker, and the weaker one decides what the public URL may contain.
 */

/** Lowercase letters, numbers and hyphens. Nothing that needs URL-escaping. */
export const OFFER_KEY = /^[a-z0-9-]+$/;

/** Long enough for a descriptive campaign link, short enough to paste. */
const MAX_KEY = 80;

/**
 * Why this key cannot be used, or null when it can.
 *
 * Returns the sentence an admin reads, not a code — this renders straight into
 * the form. Capitals get their own mention because the failure they cause is
 * not obvious: a key with a capital would save here and then make the whole
 * offer unsaveable in the main form, which is lowercase-only, and the admin
 * would meet that error on some later edit they did not connect to this one.
 */
export function offerKeyProblem(key: string): string | null {
  const k = key.trim();
  if (!k) return "The link needs a name.";
  if (k.length > MAX_KEY) return `Keep it under ${MAX_KEY} characters.`;
  if (!OFFER_KEY.test(k)) {
    return "Lowercase letters, numbers and hyphens only — no spaces, capitals or symbols.";
  }
  return null;
}

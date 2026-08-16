import { z } from "zod";

/**
 * Where an old address should send somebody now.
 *
 * Checked at the 404 boundary and nowhere else. Every other design costs
 * something on every request — middleware would look up a rule for pages that
 * were always going to work — and a redirect only matters at the exact moment
 * the router has already decided there is nothing here. So a page that exists
 * pays nothing, and the lookup happens on the one request where it is free.
 *
 * The list is small and lives in the settings blob, which is already read on
 * every render and already has a per-group save. A table would be right at
 * hundreds of rules; at tens it would be a second thing to build and back up
 * for no gain.
 */

/**
 * A path, normalised the way we will compare it.
 *
 * Leading slash, no trailing one, no query, lower case. People type all four
 * variants of the same rule and expect them to work, and a rule that silently
 * does not match is worse than no rule — it looks configured.
 */
export function normalizePath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // A full URL pasted from the browser: keep only the path.
  const path = /^https?:\/\//i.test(trimmed) ? (safeUrlPath(trimmed) ?? trimmed) : trimmed;
  const noQuery = path.split(/[?#]/)[0];
  const withSlash = noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
  const noTrailing = withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
  return noTrailing.toLowerCase();
}

function safeUrlPath(value: string): string | null {
  try {
    return new URL(value).pathname;
  } catch {
    return null;
  }
}

export const redirectSchema = z.object({
  /** The old address, as a path on this site. */
  from: z.string().trim().max(300).default(""),
  /** Where to send them — a path here, or a full URL anywhere. */
  to: z.string().trim().max(600).default(""),
  /**
   * 308 by default, because a renamed page is permanent and that is what tells
   * a search engine to move its index across. Temporary is for a campaign that
   * will come back, where a permanent redirect would be cached by browsers for
   * ever and outlive the rule.
   */
  permanent: z.boolean().default(true),
});

export const redirectsSchema = z.array(redirectSchema).max(500).default([]);

export type StoreRedirect = z.infer<typeof redirectSchema>;

/**
 * The rule for this path, if there is one.
 *
 * First match wins, in the order the list is written, so a rule can be moved
 * above a broader one. Self-redirects are refused: a rule pointing a path at
 * itself is a loop, and a browser follows it about twenty times before saying
 * something unhelpful.
 */
export function matchRedirect(
  rules: StoreRedirect[],
  pathname: string,
): { to: string; permanent: boolean } | null {
  const from = normalizePath(pathname);
  if (!from) return null;
  for (const rule of rules) {
    if (!rule.from.trim() || !rule.to.trim()) continue;
    if (normalizePath(rule.from) !== from) continue;
    const to = rule.to.trim();
    // Only a same-site target can loop, and only when it normalises to the
    // path we are already on.
    if (!/^https?:\/\//i.test(to) && normalizePath(to) === from) continue;
    return { to, permanent: rule.permanent };
  }
  return null;
}

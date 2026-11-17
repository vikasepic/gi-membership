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
  /** A label for the list; changes nothing. */
  name: z.string().trim().max(120).default(""),
  /** The old address: a path on this site, or a pattern when `match` is "pattern". */
  // The friendly 300-character limit is validateRules' to say; this only bounds storage.
  from: z.string().trim().max(1000).default(""),
  /** Where to send them: a path here, or a full URL anywhere. A pattern's `$1`-`$9` are filled in. */
  to: z.string().trim().max(600).default(""),
  /** Exact address, or a regular expression (WP Engine style, case-insensitive). */
  match: z.enum(["exact", "pattern"]).default("exact"),
  /**
   * 301 when true, 302 when false. Permanent by default, because a renamed
   * page is permanent and that is what tells a search engine to move its index
   * across. Temporary is for a campaign that will come back, where a permanent
   * redirect would be cached by browsers for ever and outlive the rule.
   */
  permanent: z.boolean().default(true),
  /** Pass the visitor's query string (UTM tags, fbclid) on, or drop it. */
  query: z.enum(["keep", "drop"]).default("keep"),
  /** Paused rules stay in the list and do nothing. */
  enabled: z.boolean().default(true),
});

export const redirectsSchema = z.array(redirectSchema).max(500).default([]);

export type StoreRedirect = z.infer<typeof redirectSchema>;

/**
 * Addresses no rule may ever catch: the admin, sign-in, checkout, the
 * members' area and Stripe's webhook (owner, 17 Nov 2026: one wrong pattern
 * must never lock anyone out or stop payments). A prefix covers everything
 * under it, on a segment boundary.
 */
const PROTECTED_PREFIXES = [
  "/admin", "/login", "/logout", "/auth", "/reset", "/api", "/checkout", "/checkout-preview",
  "/oto-preview", "/course-preview", "/account", "/library", "/apps", "/email", "/_next", "/app-icon",
];
const PROTECTED_EXACT = new Set(["/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/llms.txt", "/favicon.ico", "/icon.png"]);

export function isProtectedPath(pathname: string): boolean {
  const p = normalizePath(pathname);
  return PROTECTED_EXACT.has(p) || PROTECTED_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));
}

/** The path as the visitor typed it, minus query and trailing slash: patterns see its letter case. */
function cleanPath(raw: string): string {
  const trimmed = raw.trim();
  const path = /^https?:\/\//i.test(trimmed) ? (safeUrlPath(trimmed) ?? trimmed) : trimmed;
  const noQuery = path.split(/[?#]/)[0];
  const withSlash = noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

const STATIC_FILE = /\.(png|jpe?g|gif|webp|avif|svg|ico|js|mjs|css|json|map|woff2?|ttf|otf|txt|xml|pdf|mp4|webm|mp3|wav|zip|webmanifest)$/i;
const isExternal = (to: string) => /^https?:\/\//i.test(to);
const isValidTarget = (to: string) => to.startsWith("/") || isExternal(to);
const complete = (r: StoreRedirect) => !!r.from.trim() && !!r.to.trim();

/**
 * Whether a pattern could take seconds on a short path. Matching runs on every
 * request, on the one Node process that also takes payments, so a slow pattern
 * stops the whole site (final review, 17 Nov). Refused:
 *   - a repeated group that itself repeats or has alternatives: (a+)+, (a|a)+
 *   - more than three unbounded repeats (+, *, {n,}) in one pattern.
 * Walks the source rather than regexing it, so escapes and [classes] count right.
 */
export function slowPattern(source: string): boolean {
  const groups: { inner: boolean }[] = [];
  let unbounded = 0;
  let lastGroupInner: boolean | null = null;
  const quantifierAt = (i: number): "unbounded" | "bounded" | null => {
    const c = source[i];
    if (c === "+" || c === "*") return "unbounded";
    if (c === "?") return "bounded";
    if (c === "{") return /^\{\d+,\}/.test(source.slice(i)) ? "unbounded" : /^\{\d+(,\d+)?\}/.test(source.slice(i)) ? "bounded" : null;
    return null;
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const prevGroup = lastGroupInner;
    lastGroupInner = null;
    if (c === "\\") { i++; continue; }
    if (c === "[") {
      for (i++; i < source.length && source[i] !== "]"; i++) if (source[i] === "\\") i++;
      continue;
    }
    if (c === "(") { groups.push({ inner: false }); continue; }
    if (c === "|") { if (groups.length) groups[groups.length - 1].inner = true; continue; }
    if (c === ")") {
      const g = groups.pop();
      lastGroupInner = g?.inner ?? false;
      if (g?.inner && groups.length) groups[groups.length - 1].inner = true;
      continue;
    }
    const q = quantifierAt(i);
    if (!q) continue;
    if (q === "unbounded") unbounded++;
    if (groups.length && q !== "bounded") groups[groups.length - 1].inner = true;
    if (q === "unbounded" && prevGroup) return true;
  }
  return unbounded > 3;
}

const compiled = new Map<string, RegExp | null>();
/** A stored pattern that no longer compiles, or could be slow, is skipped, never thrown. */
function patternOf(source: string): RegExp | null {
  if (!compiled.has(source)) {
    let re: RegExp | null = null;
    try {
      re = slowPattern(source) ? null : new RegExp(source, "i");
    } catch {
      re = null;
    }
    compiled.set(source, re);
  }
  return compiled.get(source) ?? null;
}

/** Where one rule sends this address, before the query is handled; null when it doesn't apply. */
function destinationFor(rule: StoreRedirect, path: string): string | null {
  if (!rule.enabled || !complete(rule)) return null;
  const to = rule.to.trim();
  if (!isValidTarget(to)) return null;
  let dest: string;
  if (rule.match === "pattern") {
    const re = patternOf(rule.from.trim());
    const visited = cleanPath(path);
    // A pattern never sees a long path, nor a file: a broad rule must not
    // take the checkout's card logos or the admin's icon list with it.
    if (!re || visited.length > 256 || STATIC_FILE.test(visited)) return null;
    const m = re.exec(visited);
    if (!m) return null;
    dest = to.replace(/\$([1-9])/g, (_, n: string) => m[Number(n)] ?? "");
  } else {
    if (normalizePath(rule.from) !== normalizePath(path)) return null;
    dest = to;
  }
  // Only a same-site target can loop on itself.
  if (!isExternal(dest) && normalizePath(dest) === normalizePath(path)) return null;
  return dest;
}

/**
 * The visitor's query goes on to the destination unless the rule drops it,
 * so ad and email tags survive; the destination's own value wins a clash.
 * `_rsc` is Next's own and never passed on.
 */
function withQuery(dest: string, search: string, keep: boolean): string {
  const u = new URL(dest, "https://grow.local");
  u.searchParams.delete("_rsc");
  if (keep) {
    for (const [k, v] of new URLSearchParams(search)) {
      if (k !== "_rsc" && !u.searchParams.has(k)) u.searchParams.append(k, v);
    }
  }
  return isExternal(dest) ? u.toString() : `${u.pathname}${u.search}${u.hash}`;
}

/**
 * The rule for this address, if there is one. First match wins, top to
 * bottom; a protected address is never matched.
 */
export function matchRedirect(
  rules: StoreRedirect[],
  pathname: string,
  search = "",
): { location: string; status: 301 | 302; ruleIndex: number } | null {
  if (!normalizePath(pathname) || isProtectedPath(pathname)) return null;
  for (const [i, rule] of rules.entries()) {
    const dest = destinationFor(rule, pathname);
    if (dest === null) continue;
    return { location: withQuery(dest, search, rule.query !== "drop"), status: rule.permanent ? 301 : 302, ruleIndex: i };
  }
  return null;
}

export type TraceStep = { ruleIndex: number; location: string; status: 301 | 302 };

/** Follow an address through the rules, as the test box and the save check do. */
export function traceRedirect(
  rules: StoreRedirect[],
  address: string,
  maxHops = 10,
): { steps: TraceStep[]; protectedPath: boolean; loop: boolean } {
  let path = cleanPath(address);
  let search = address.includes("?") ? `?${address.split("?")[1].split("#")[0]}` : "";
  if (isProtectedPath(path)) return { steps: [], protectedPath: true, loop: false };
  const steps: TraceStep[] = [];
  const seen = new Set([normalizePath(path)]);
  for (;;) {
    const m = matchRedirect(rules, path, search);
    if (!m) return { steps, protectedPath: false, loop: false };
    steps.push(m);
    if (isExternal(m.location)) return { steps, protectedPath: false, loop: false };
    const next = new URL(m.location, "https://grow.local");
    path = next.pathname;
    search = next.search;
    const key = normalizePath(path);
    if (seen.has(key) || steps.length >= maxHops) return { steps, protectedPath: false, loop: true };
    seen.add(key);
  }
}

export type RuleProblem = { index: number; message: string };

/**
 * What stops a save, one problem per rule. The loop check is best effort: a
 * pattern is followed from its own destination with every `$n` as "x", and
 * a pattern that loops only for some addresses can't be ruled out in general.
 */
export function validateRules(rules: StoreRedirect[]): RuleProblem[] {
  const problems = new Map<number, string>();
  for (const [i, rule] of rules.entries()) {
    if (!complete(rule)) continue;
    const from = rule.from.trim();
    const to = rule.to.trim();
    if (!isValidTarget(to)) problems.set(i, "Send it to a path starting with / or a full https:// address.");
    else if (rule.match === "exact" && isProtectedPath(from)) {
      problems.set(i, "That address is part of the admin, checkout or members' area, so it can't be redirected.");
    } else if (rule.match === "pattern") {
      if (from.length > 300) problems.set(i, "Keep a pattern under 300 characters.");
      else {
        try {
          new RegExp(from, "i");
          if (slowPattern(from)) {
            problems.set(i, "That pattern could slow every page down. Avoid a repeated group like (a+)+ or (a|b)+, and use at most three * or +.");
          }
        } catch (e) {
          problems.set(i, `That pattern isn't valid: ${e instanceof Error ? e.message : String(e)}.`);
        }
      }
    }
  }
  for (const [i, rule] of rules.entries()) {
    if (!complete(rule) || !rule.enabled || problems.has(i)) continue;
    const start = rule.match === "pattern" ? rule.to.trim().replace(/\$[1-9]/g, "x") : rule.from.trim();
    if (isExternal(start)) continue;
    const trace = traceRedirect(rules, start);
    if (!trace.loop) continue;
    const chain = [cleanPath(start), ...trace.steps.map((s) => s.location)].join(" → ");
    for (const s of [{ ruleIndex: i }, ...trace.steps]) {
      if (!problems.has(s.ruleIndex)) problems.set(s.ruleIndex, `These rules send visitors in a circle: ${chain}`);
    }
  }
  return [...problems].sort(([a], [b]) => a - b).map(([index, message]) => ({ index, message }));
}

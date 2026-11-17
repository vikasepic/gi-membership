import { createServiceClient } from "@/lib/supabase/server";
import { redirectsSchema, type StoreRedirect } from "@/lib/redirects";
import { STORE_SLUG } from "@/lib/store-slug";

/**
 * The redirect rules, held in this process for the proxy (spec:
 * docs/superpowers/specs/2026-11-17-redirect-manager-design.md). The proxy
 * runs on every page, so a cache hit costs no network call. Saving the
 * Redirects group clears it; another process sees a change within 30 seconds.
 *
 * A failed read is held as "no rules" for 5 seconds: the pages load as normal,
 * and a database that is down is not asked again on every request.
 */
const TTL_MS = 30_000;
const FAILED_TTL_MS = 5_000;

let held: { rules: StoreRedirect[]; until: number } | null = null;

export function clearRedirectCache(): void {
  held = null;
}

export async function loadRedirectRules(): Promise<StoreRedirect[]> {
  const { data, error } = await createServiceClient()
    .from("stores")
    .select("redirects:settings->redirects")
    .eq("slug", STORE_SLUG)
    .maybeSingle();
  if (error) throw new Error(`redirect rules: ${error.message}`);
  return redirectsSchema.parse((data as { redirects?: unknown } | null)?.redirects ?? []);
}

// ponytail: two first requests at once may each load; one extra read, no harm.
export async function cachedRedirectRules(
  load: () => Promise<StoreRedirect[]> = loadRedirectRules,
  now: number = Date.now(),
): Promise<StoreRedirect[]> {
  if (held && now < held.until) return held.rules;
  try {
    const rules = await load();
    held = { rules, until: now + TTL_MS };
  } catch (e) {
    console.error("[redirects] could not read the rules:", e);
    held = { rules: [], until: now + FAILED_TTL_MS };
  }
  return held.rules;
}

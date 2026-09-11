import { outcomeOf, type VisitRow } from "@/lib/visit-view";

/**
 * The narrowing the visit log's four selects, plus the "See the visit" deep
 * link, apply.
 *
 * Kept separate from the page so it can be tested without one — the page
 * only builds the whitelist (which values are actually present in the rows
 * it loaded) and reads the URL; matching a single visit against a chosen
 * value is the same regardless of who called it.
 *
 * `visit` is a direct id match, not a search — the page whitelists it
 * against the ids of the rows it already loaded, exactly like the other
 * four, so a visit outside the current range/limit can never leak in.
 */
export type VisitFilter = { campaign: string; host: string; device: string; outcome: string; visit: string };

export function keepVisit(v: VisitRow, f: VisitFilter): boolean {
  if (f.campaign && v.utmLast.utm_campaign !== f.campaign) return false;
  if (f.host && v.referrerHost !== f.host) return false;
  if (f.device && v.device !== f.device) return false;
  if (f.outcome && outcomeOf(v) !== f.outcome) return false;
  if (f.visit && v.id !== f.visit) return false;
  return true;
}

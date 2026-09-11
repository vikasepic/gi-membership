import { outcomeOf, type VisitRow } from "@/lib/visit-view";

/**
 * The narrowing the visit log's four selects apply.
 *
 * Kept separate from the page so it can be tested without one — the page
 * only builds the whitelist (which values are actually present in the rows
 * it loaded) and reads the URL; matching a single visit against a chosen
 * value is the same regardless of who called it.
 */
export type VisitFilter = { campaign: string; host: string; device: string; outcome: string };

export function keepVisit(v: VisitRow, f: VisitFilter): boolean {
  if (f.campaign && v.utmLast.utm_campaign !== f.campaign) return false;
  if (f.host && v.referrerHost !== f.host) return false;
  if (f.device && v.device !== f.device) return false;
  if (f.outcome && outcomeOf(v) !== f.outcome) return false;
  return true;
}

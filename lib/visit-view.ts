import { UTM_KEYS } from "@/lib/attribution";

/**
 * Turning a visit row into what the admin screens show.
 *
 * Pure input to output: no database, no request, no `server-only`. That is
 * deliberate — `lib/visit-reports.ts` starts with `import "server-only"` and
 * a jsdom component test that reaches it throws, so the components import
 * their types and their arithmetic from here instead. Same split as
 * `lib/traffic-funnel.ts` sitting pure beside the `server-only`
 * `lib/traffic.ts`.
 */

export type CampaignRow = {
  source: string; medium: string; campaign: string; adset: string; ad: string;
  visits: number; checkouts: number; orders: number; revenueCents: number;
};
export type SourceRow = { key: string; visits: number; orders: number; revenueCents: number };
export type VisitStep = { step: string; at: string; orderId: string | null; valueCents: number | null };
export type VisitRow = {
  id: string; startedAt: string; landingPath: string; landingQuery: string | null;
  referrer: string | null; referrerHost: string | null;
  utmFirst: Record<string, string>; utmLast: Record<string, string>;
  device: string | null; browser: string | null; os: string | null; userAgent: string | null;
  steps: VisitStep[];
};

const SHORT: Record<string, string> = {
  utm_source: "Source", utm_medium: "Medium", utm_campaign: "Campaign",
  utm_adset: "Ad set", utm_content: "Ad", utm_term: "Term", utm_id: "Campaign id",
};

/** The labels a reader sees, in UTM_KEYS order rather than object order. */
export function labelPairs(labels: Record<string, string>): { label: string; value: string }[] {
  return UTM_KEYS.filter((k) => labels[k]).map((k) => ({ label: SHORT[k], value: labels[k] }));
}

/** The furthest point a visit reached. */
export function outcomeOf(v: VisitRow): "bought" | "upsell" | "checkout" | "browsed" {
  const has = (s: string) => v.steps.some((x) => x.step === s);
  if (has("purchase")) return "bought";
  if (has("upsell")) return "upsell";
  if (has("checkout")) return "checkout";
  return "browsed";
}

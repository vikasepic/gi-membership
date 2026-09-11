import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { UTM_KEYS } from "@/lib/attribution";
import type { DayRange } from "@/lib/traffic-funnel";

/**
 * Reading the visits back.
 *
 * Every aggregate is a Postgres function (migration 0081), never a group-by
 * in JavaScript over rows pulled through PostgREST — which truncates at 1000
 * silently and would quietly understate every number on these screens.
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

function bounds(range: DayRange): { from: string; to: string } {
  return {
    from: `${range.start}T00:00:00.000Z`,
    to: new Date(Date.parse(`${range.end}T00:00:00Z`) + 86_400_000).toISOString(),
  };
}

async function rollup<T>(fn: string, range: DayRange): Promise<T[]> {
  try {
    const { from, to } = bounds(range);
    const db = createServiceClient();
    const { data } = await db.rpc(fn, { p_store: await getStoreId(), p_from: from, p_to: to });
    return (data as T[]) ?? [];
  } catch {
    // Same rule as lib/traffic.ts: an admin screen that cannot count must
    // render empty, not throw.
    return [];
  }
}

export async function campaignRows(range: DayRange): Promise<CampaignRow[]> {
  const raw = await rollup<Record<string, unknown>>("visit_campaign_rollup", range);
  return raw
    .map((r) => ({
      source: String(r.source), medium: String(r.medium), campaign: String(r.campaign),
      adset: String(r.adset), ad: String(r.ad),
      visits: Number(r.visits), checkouts: Number(r.checkouts),
      orders: Number(r.orders), revenueCents: Number(r.revenue_cents),
    }))
    .sort((a, b) => b.visits - a.visits || a.campaign.localeCompare(b.campaign));
}

const sourceRows = (raw: Record<string, unknown>[]): SourceRow[] =>
  raw
    .map((r) => ({ key: String(r.key), visits: Number(r.visits), orders: Number(r.orders), revenueCents: Number(r.revenue_cents) }))
    .sort((a, b) => b.visits - a.visits || a.key.localeCompare(b.key));

export async function referrerRows(range: DayRange): Promise<SourceRow[]> {
  return sourceRows(await rollup<Record<string, unknown>>("visit_referrer_rollup", range));
}

export async function landingRows(range: DayRange): Promise<SourceRow[]> {
  return sourceRows(await rollup<Record<string, unknown>>("visit_landing_rollup", range));
}

/** The visit log. Bounded by `limit` because this one is not an aggregate. */
export async function recentVisits(range: DayRange, limit = 100): Promise<VisitRow[]> {
  try {
    const { from, to } = bounds(range);
    const db = createServiceClient();
    const { data } = await db
      .from("visits")
      .select("id, started_at, landing_path, landing_query, referrer, referrer_host, utm_first, utm_last, device, browser, os, user_agent, visit_steps(step, at, order_id, value_cents)")
      .eq("store_id", await getStoreId())
      .gte("started_at", from)
      .lt("started_at", to)
      .order("started_at", { ascending: false })
      .limit(limit);
    return (data ?? []).map((v) => ({
      id: v.id as string,
      startedAt: v.started_at as string,
      landingPath: v.landing_path as string,
      landingQuery: (v.landing_query as string) ?? null,
      referrer: (v.referrer as string) ?? null,
      referrerHost: (v.referrer_host as string) ?? null,
      utmFirst: (v.utm_first as Record<string, string>) ?? {},
      utmLast: (v.utm_last as Record<string, string>) ?? {},
      device: (v.device as string) ?? null,
      browser: (v.browser as string) ?? null,
      os: (v.os as string) ?? null,
      userAgent: (v.user_agent as string) ?? null,
      steps: ((v.visit_steps as Record<string, unknown>[]) ?? []).map((s) => ({
        step: String(s.step), at: String(s.at),
        orderId: (s.order_id as string) ?? null,
        valueCents: (s.value_cents as number) ?? null,
      })),
    }));
  } catch {
    return [];
  }
}

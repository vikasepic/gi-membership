import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import type { DayRange } from "@/lib/traffic-funnel";
import type { CampaignRow, SourceRow, VisitRow } from "@/lib/visit-view";
import { metaNamesFor } from "@/lib/meta-names";
import { namedLabel, namedLabels } from "@/lib/meta-id";

/**
 * Reading the visits back.
 *
 * Every aggregate is a Postgres function (migration 0081), never a group-by
 * in JavaScript over rows pulled through PostgREST — which truncates at 1000
 * silently and would quietly understate every number on these screens.
 *
 * The row types and the pure `outcomeOf`/`labelPairs` arithmetic live in
 * `lib/visit-view.ts`, which has no `server-only` import — the same split
 * as `lib/traffic-funnel.ts` sitting pure beside the `server-only`
 * `lib/traffic.ts`. Re-exported here so this file's non-client callers did
 * not have to change; a client component must import `lib/visit-view`
 * directly and never reach this file.
 */

export type { CampaignRow, SourceRow, VisitStep, VisitRow } from "@/lib/visit-view";
export { outcomeOf, labelPairs } from "@/lib/visit-view";

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
  const rows = raw.map((r) => ({
    source: String(r.source), medium: String(r.medium), campaign: String(r.campaign),
    adset: String(r.adset), ad: String(r.ad),
    visits: Number(r.visits), checkouts: Number(r.checkouts),
    orders: Number(r.orders), revenueCents: Number(r.revenue_cents),
  }));

  // Meta's default dynamic parameters send ids, not names, so most of this
  // table read `120250826827780282` where somebody needs the campaign. Resolved
  // AFTER the rows are built and BEFORE the sort, so the alphabetical tiebreak
  // orders by what a reader actually sees.
  const names = await metaNamesFor(rows.flatMap((r) => [r.campaign, r.adset, r.ad]));
  return rows
    .map((r) => ({
      ...r,
      campaign: namedLabel(r.campaign, names),
      adset: namedLabel(r.adset, names),
      ad: namedLabel(r.ad, names),
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
    const rows = data ?? [];
    // One lookup for the whole page, over every label on every visit — the
    // alternative is a query per row on the busiest screen in the admin.
    const names = await metaNamesFor(
      rows.flatMap((v) => [
        ...Object.values((v.utm_first as Record<string, string>) ?? {}),
        ...Object.values((v.utm_last as Record<string, string>) ?? {}),
      ]),
    );
    return rows.map((v) => ({
      id: v.id as string,
      startedAt: v.started_at as string,
      landingPath: v.landing_path as string,
      landingQuery: (v.landing_query as string) ?? null,
      referrer: (v.referrer as string) ?? null,
      referrerHost: (v.referrer_host as string) ?? null,
      utmFirst: namedLabels((v.utm_first as Record<string, string>) ?? {}, names),
      utmLast: namedLabels((v.utm_last as Record<string, string>) ?? {}, names),
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

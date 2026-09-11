import Link from "next/link";
import { referrerRows, landingRows } from "@/lib/visit-reports";
import { SourceTable } from "@/components/admin/source-table";
import { PRESETS, presetFrom, rangeOf } from "@/lib/traffic-funnel";
import { todayUtc } from "@/lib/traffic";

export const dynamic = "force-dynamic";

const RANKS = ["visits", "orders"] as const;
type Rank = (typeof RANKS)[number];

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined);

/**
 * Which outside sites send traffic, and which pages people land on.
 *
 * `referrerRows` names `direct` for visits with no referrer host; `landingRows`
 * has no such fallback because every visit landed somewhere. Both are rendered
 * exactly as the rollups return them, so neither table hides a share of traffic
 * by omitting the row for it.
 */
export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preset = presetFrom(params);
  const range = rangeOf(preset, todayUtc());
  // Whitelisted, never parsed: an unrecognised value picks the default.
  const rankRaw = one(params.rank);
  const rank: Rank = RANKS.includes(rankRaw as Rank) ? (rankRaw as Rank) : "visits";

  const [referrers, landings] = await Promise.all([referrerRows(range), landingRows(range)]);

  const href = (over: Record<string, string>) => {
    const q = new URLSearchParams();
    if (preset !== "30") q.set("preset", preset);
    if (rank !== "visits") q.set("rank", rank);
    for (const [k, v] of Object.entries(over)) v ? q.set(k, v) : q.delete(k);
    const s = q.toString();
    return s ? `/admin/attribution/sources?${s}` : "/admin/attribution/sources";
  };

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-1">
        <Link href="/admin/attribution" className="kicker w-fit text-muted hover:text-fg">
          &larr; Campaigns
        </Link>
        <h1 className="text-3xl">Referrers and landing pages</h1>
        <p className="max-w-3xl text-muted">
          Which outside sites send visits, and which pages people land on. Visits with no referrer are
          direct — a row here, not an omission.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <Link
            key={p.key}
            href={href({ preset: p.key === "30" ? "" : p.key })}
            aria-current={preset === p.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              preset === p.key ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted hover:border-fg hover:text-fg"
            }`}
          >
            {p.label}
          </Link>
        ))}
        <Link href="/admin/attribution/visits" className="ml-auto text-xs text-muted underline-offset-4 hover:underline">
          Every visit →
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        Rank by
        {RANKS.map((r) => (
          <Link
            key={r}
            href={href({ rank: r === "visits" ? "" : r })}
            aria-current={rank === r ? "page" : undefined}
            className={`rounded-full border px-3 py-1 transition-colors ${
              rank === r ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted hover:border-fg hover:text-fg"
            }`}
          >
            {r === "visits" ? "Visits" : "Orders"}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SourceTable title="Referrers" nameHeader="Site" rows={referrers} rank={rank} />
        <SourceTable title="Landing pages" nameHeader="Page" rows={landings} rank={rank} />
      </div>
    </div>
  );
}

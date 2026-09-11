import Link from "next/link";
import { campaignRows } from "@/lib/visit-reports";
import { CampaignTable, type CampaignSort } from "@/components/admin/campaign-table";
import { PRESETS, presetFrom, rangeOf } from "@/lib/traffic-funnel";
import { todayUtc } from "@/lib/traffic";

export const dynamic = "force-dynamic";

const SORTS: readonly CampaignSort[] = ["visits", "checkouts", "orders", "revenue"];
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined);

export default async function AttributionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preset = presetFrom(params);
  const range = rangeOf(preset, todayUtc());
  // Whitelisted, never parsed: an unrecognised value picks the default.
  const sortRaw = one(params.sort);
  const sort: CampaignSort = SORTS.includes(sortRaw as CampaignSort) ? (sortRaw as CampaignSort) : "visits";
  const dir = one(params.dir) === "asc" ? "asc" : "desc";

  const rows = await campaignRows(range);
  const key = (r: (typeof rows)[number]) =>
    sort === "revenue" ? r.revenueCents : sort === "orders" ? r.orders : sort === "checkouts" ? r.checkouts : r.visits;
  const shown = [...rows].sort((a, b) => (dir === "asc" ? key(a) - key(b) : key(b) - key(a)));

  const href = (over: Record<string, string>) => {
    const q = new URLSearchParams();
    if (preset !== "30") q.set("preset", preset);
    if (sort !== "visits") q.set("sort", sort);
    if (dir !== "desc") q.set("dir", dir);
    for (const [k, v] of Object.entries(over)) v ? q.set(k, v) : q.delete(k);
    const s = q.toString();
    return s ? `/admin/attribution?${s}` : "/admin/attribution";
  };

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">Campaigns</h1>
        <p className="max-w-3xl text-muted">
          Every visit recorded on the server, grouped by the campaign that brought it. Direct and referral
          traffic are rows here too, so the share that is paid is readable rather than assumed.
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
        <Link href="/admin/attribution/sources" className="text-xs text-muted underline-offset-4 hover:underline">
          Referrers and landing pages →
        </Link>
      </div>

      <CampaignTable
        rows={shown}
        sort={sort}
        dir={dir}
        hrefFor={(s, d) => href({ sort: s === "visits" ? "" : s, dir: d === "desc" ? "" : d })}
      />
    </div>
  );
}

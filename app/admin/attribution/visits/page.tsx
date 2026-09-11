import Link from "next/link";
import { recentVisits } from "@/lib/visit-reports";
import { keepVisit } from "@/lib/visit-filter";
import { VisitRowView } from "@/components/admin/visit-row";
import { PRESETS, presetFrom, rangeOf } from "@/lib/traffic-funnel";
import { todayUtc } from "@/lib/traffic";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined);

const OUTCOMES = ["bought", "upsell", "checkout", "browsed"] as const;
const LIMITS = ["100", "250", "500"] as const;

/** A URL value against a whitelist — never a parse. An unrecognised value is "". */
const pick = <T extends string>(raw: string | undefined, allowed: readonly T[]): T | "" =>
  (allowed as readonly string[]).includes(raw ?? "") ? (raw as T) : "";

/**
 * Every visit, one row each — where WP Statistics and GA4's visitor detail
 * live for this store.
 *
 * `recentVisits` bounds itself with `limit` before any of the four selects
 * below run, so this page is a window onto the most recent visits in the
 * chosen range, not a search across all of them. Raising Rows widens that
 * window; it does not change what a filter searches.
 */
export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preset = presetFrom(params);
  const range = rangeOf(preset, todayUtc());
  const limit = pick(one(params.limit), LIMITS) || "100";

  const all = await recentVisits(range, Number(limit));

  // Built from the rows on screen, so the URL can only name something real.
  const campaignsPresent = [...new Set(all.map((v) => v.utmLast.utm_campaign).filter(Boolean))] as string[];
  const hostsPresent = [...new Set(all.map((v) => v.referrerHost).filter(Boolean))] as string[];
  const devicesPresent = [...new Set(all.map((v) => v.device).filter(Boolean))] as string[];

  const campaign = pick(one(params.campaign), campaignsPresent);
  const host = pick(one(params.host), hostsPresent);
  const device = pick(one(params.device), devicesPresent);
  const outcome = pick(one(params.outcome), OUTCOMES);
  const filtered = campaign || host || device || outcome;

  const shown = all.filter((v) => keepVisit(v, { campaign, host, device, outcome }));

  const href = (over: Record<string, string>) => {
    const q = new URLSearchParams();
    if (preset !== "30") q.set("preset", preset);
    if (campaign) q.set("campaign", campaign);
    if (host) q.set("host", host);
    if (device) q.set("device", device);
    if (outcome) q.set("outcome", outcome);
    if (limit !== "100") q.set("limit", limit);
    for (const [k, v] of Object.entries(over)) v ? q.set(k, v) : q.delete(k);
    const s = q.toString();
    return s ? `/admin/attribution/visits?${s}` : "/admin/attribution/visits";
  };

  const clearFiltersHref = (() => {
    const q = new URLSearchParams();
    if (preset !== "30") q.set("preset", preset);
    if (limit !== "100") q.set("limit", limit);
    const s = q.toString();
    return s ? `/admin/attribution/visits?${s}` : "/admin/attribution/visits";
  })();

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-1">
        <Link href="/admin/attribution" className="kicker w-fit text-muted hover:text-fg">
          &larr; Campaigns
        </Link>
        <h1 className="text-3xl">Visits</h1>
        <p className="max-w-3xl text-muted">
          Every visit recorded on the server, one row each — where it landed, where it came from, and how far
          it got.
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
      </div>

      {/* The four selects below only narrow the rows this page already
          loaded — they never reach further into history than Rows does. */}
      <p className="text-xs text-muted">
        Filters narrow the {all.length.toLocaleString("en-US")} most recent visits loaded for this range, not
        your full history — raise Rows to look further back within the same window.
      </p>

      <form action="/admin/attribution/visits" className="flex flex-wrap items-center gap-2">
        {preset !== "30" && <input type="hidden" name="preset" value={preset} />}
        <Picker
          name="campaign"
          value={campaign}
          options={[{ key: "", label: "Any campaign" }, ...campaignsPresent.map((c) => ({ key: c, label: c }))]}
          label="Campaign"
        />
        <Picker
          name="host"
          value={host}
          options={[{ key: "", label: "Any site" }, ...hostsPresent.map((h) => ({ key: h, label: h }))]}
          label="Referrer"
        />
        <Picker
          name="device"
          value={device}
          options={[{ key: "", label: "Any device" }, ...devicesPresent.map((d) => ({ key: d, label: d }))]}
          label="Device"
        />
        <Picker
          name="outcome"
          value={outcome}
          options={[{ key: "", label: "Any outcome" }, ...OUTCOMES.map((o) => ({ key: o, label: o }))]}
          label="Outcome"
        />
        <Picker
          name="limit"
          value={limit}
          options={LIMITS.map((l) => ({ key: l, label: `${l} rows` }))}
          label="Rows"
        />
        <button
          type="submit"
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-primary hover:text-fg"
        >
          Apply
        </button>
        {filtered && (
          <Link href={clearFiltersHref} className="text-xs text-muted underline-offset-4 hover:underline">
            Clear
          </Link>
        )}
      </form>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-5 py-10 text-center text-muted">
          {all.length === 0 ? "No visits in this range yet." : "Nothing matches that. Widen the range, or clear the filters."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[48rem] border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <Th>When</Th>
                <Th>Landed on</Th>
                <Th>Came from</Th>
                <Th>Device</Th>
                <Th right>Outcome</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {shown.map((v) => (
                <VisitRowView key={v.id} visit={v} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2 text-[0.62rem] font-medium uppercase tracking-[0.12em] text-muted ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Picker<T extends string>({
  name,
  value,
  options,
  label,
}: {
  name: string;
  value: T;
  options: { key: T; label: string }[];
  label: string;
}) {
  return (
    <select
      name={name}
      defaultValue={value}
      aria-label={label}
      className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
    >
      {options.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

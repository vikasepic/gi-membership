import Link from "next/link";
import { scrollPaths, scrollRows } from "@/lib/visit-reports";
import { PRESETS, presetFrom, rangeOf } from "@/lib/traffic-funnel";
import { todayUtc } from "@/lib/traffic";

export const dynamic = "force-dynamic";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined);

/**
 * Where visits stop reading a sales page.
 *
 * One bar per section, in page order: the share of visits that got at least
 * that far. The first big step down is where the page loses people.
 */
export default async function ScrollPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preset = presetFrom(params);
  const range = rangeOf(preset, todayUtc());
  const paths = await scrollPaths(range);
  // Whitelisted against the pages that have data; anything else picks the busiest.
  const wanted = one(params.path);
  const path = paths.find((p) => p.path === wanted)?.path ?? paths[0]?.path ?? null;
  const rows = path ? await scrollRows(path, range) : [];
  const total = rows[0]?.visits ?? 0;

  const href = (over: Record<string, string>) => {
    const q = new URLSearchParams();
    if (preset !== "30") q.set("preset", preset);
    if (path) q.set("path", path);
    for (const [k, v] of Object.entries(over)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    const s = q.toString();
    return s ? `/admin/attribution/scroll?${s}` : "/admin/attribution/scroll";
  };

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">Scroll depth</h1>
        <p className="max-w-3xl text-muted">
          How far down a sales page each visit got, by section. A section counts as reached once its top has
          come into view. The first big drop is where the page loses people.
        </p>
        <Link href="/admin/attribution" className="text-sm text-primary hover:underline">← Campaigns</Link>
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

      {paths.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {paths.map((p) => (
            <Link
              key={p.path}
              href={href({ path: p.path })}
              aria-current={path === p.path ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                path === p.path ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted hover:border-fg hover:text-fg"
              }`}
            >
              {p.path} · {p.visits}
            </Link>
          ))}
        </div>
      )}

      {!path ? (
        <p className="text-muted">No scroll data in this window yet. It starts collecting from the first visit after 25 Sep 2026.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">
            <span className="font-medium text-fg">{path}</span> · {total} visits with scroll data
          </p>
          <ol className="flex flex-col gap-1">
            {rows.map((r) => {
              const pct = total ? Math.round((r.reached / total) * 100) : 0;
              return (
                <li key={r.section} className="grid grid-cols-[2rem_1fr_4rem] items-center gap-3 text-sm">
                  <span className="text-muted tabular-nums">{r.section + 1}</span>
                  <span className="relative h-7 overflow-hidden rounded bg-muted/20">
                    <span className="absolute inset-y-0 left-0 bg-primary/30" style={{ width: `${pct}%` }} />
                    <span className="relative px-2 leading-7 truncate block">{r.label}</span>
                  </span>
                  <span className="text-right tabular-nums">{pct}%</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { loadMoneyData } from "@/lib/money-data";
import { deriveTrials, trialsFor, trialsByWeek, type TrialView } from "@/lib/trials-view";
import { money } from "@/lib/money";
import { Tile, Chip, Pill, fmtDate, Soon, Th, Empty } from "@/components/admin/money-ui";

/**
 * Trials: every free trial, when it ends, and what became of it. A trial
 * converts the day its first payment goes through.
 */
const VIEWS: { key: TrialView; label: string }[] = [
  { key: "all", label: "All trials" },
  { key: "on trial", label: "On trial" },
  { key: "ending", label: "Ending this week" },
  { key: "converted", label: "Converted" },
  { key: "lost", label: "Cancelled or lapsed" },
];

export default async function TrialsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.view) ? sp.view[0] : sp.view;
  const view: TrialView = VIEWS.some((v) => v.key === raw) ? (raw as TrialView) : "all";
  const [, data] = await Promise.all([requireAdmin(), loadMoneyData()]);
  const all = deriveTrials(data);
  const onTrial = trialsFor(all, "on trial");
  const ending = trialsFor(all, "ending");
  const converted = trialsFor(all, "converted");
  const lost = trialsFor(all, "lost");
  const settled = converted.length + lost.length;
  const rate = settled ? Math.round((converted.length / settled) * 100) : 0;
  const rows = trialsFor(all, view);
  const cur = all[0]?.currency ?? "usd";
  const weeks = trialsByWeek(all);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Trials</h1>
        <p className="max-w-2xl text-sm text-muted">Every free trial, when it ends, and what happened to it. A trial converts the day its first payment goes through.</p>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Tile label="On trial now" value={String(onTrial.length)} hint={ending.length ? `${ending.length} end this week` : "none ending this week"} tone={ending.length ? "warn" : undefined} />
        <Tile label="Converted" value={String(converted.length)} hint={`${rate}% of the ${settled} that have ended`} />
        <Tile label="Cancelled or lapsed" value={String(lost.length)} />
        <Tile label="Paid by converted trials" value={money(converted.reduce((n, t) => n + t.paidTotalCents, 0), cur)} hint="all time" />
      </div>

      <div className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Chip key={v.key} href={v.key === "all" ? "/admin/trials" : `/admin/trials?view=${encodeURIComponent(v.key)}`} active={view === v.key} count={trialsFor(all, v.key).length}>{v.label}</Chip>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="bg-surface-2"><tr><Th>Person</Th><Th>Trial of</Th><Th>Started</Th><Th>Ends</Th><Th>What happened</Th><Th right>Paid so far</Th></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6}><Empty>No trials here.</Empty></td></tr>
            ) : (
              rows.map((t) => (
                <tr key={t.stripeSubscriptionId} className="border-t border-border align-top hover:bg-surface-2">
                  <td className="px-3 py-3">
                    {t.userId ? <Link href={`/admin/members/${t.userId}`} className="font-medium hover:text-primary">{t.name || t.email}</Link> : <span className="font-medium">{t.name || t.email}</span>}
                    {t.name && <div className="text-xs text-muted">{t.email}</div>}
                  </td>
                  <td className="px-3 py-3">{t.what}<div className="text-xs text-muted">{money(t.thenCents, t.currency)} a {t.interval ?? "month"} after</div></td>
                  <td className="whitespace-nowrap px-3 py-3">{fmtDate(t.startedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {t.outcome === "on trial" ? <><Soon iso={t.endsAt} now={data.now} /><div className="text-xs text-muted">{fmtDate(t.endsAt)}</div></> : fmtDate(t.endsAt)}
                  </td>
                  <td className="px-3 py-3">
                    <Pill tone={t.outcome === "converted" ? "good" : t.outcome === "on trial" ? "warn" : "bad"}>{t.outcome}</Pill>{" "}
                    <span className="text-xs text-muted">
                      {t.outcome === "converted" && `first payment ${fmtDate(t.outcomeAt)}${t.cancelledSince ? ", cancelled since" : ""}`}
                      {t.outcome === "cancelled" && `on ${fmtDate(t.outcomeAt)}, before paying`}
                      {t.outcome === "on trial" && `card on file, charges ${fmtDate(t.endsAt)}`}
                      {t.outcome === "ended unpaid" && "the card was not charged"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-display tabular-nums">{t.paidTotalCents ? money(t.paidTotalCents, t.currency) : <span className="text-muted">$0</span>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">By the week they started</h2>
        <p className="text-xs text-muted">Green paid, red did not, amber still on trial.</p>
        {weeks.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No trials yet.</p>
        ) : (
          <ul className="mt-2">
            {weeks.map((w) => {
              const pct = (n: number) => Math.round((n / w.started) * 100);
              const sentence = w.pending === w.started ? `${w.started} started, all still on trial` : `${w.started} started: ${w.converted} paid, ${w.lost} did not${w.pending ? `, ${w.pending} still deciding` : ""}`;
              return (
                <li key={w.weekStart} className="grid grid-cols-[8rem_1fr_auto] items-center gap-3 border-t border-border py-2.5 text-sm first:border-t-0">
                  <span className="whitespace-nowrap text-muted">Week of {fmtDate(w.weekStart)}</span>
                  <span>
                    {sentence}
                    <span className="mt-1 flex h-1.5 overflow-hidden rounded bg-surface-2">
                      <i className="block bg-emerald-600" style={{ width: `${pct(w.converted)}%` }} />
                      <i className="block bg-primary" style={{ width: `${pct(w.lost)}%` }} />
                      <i className="block bg-amber-500" style={{ width: `${pct(w.pending)}%` }} />
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-display tabular-nums">{w.paidCents ? `${money(w.paidCents, cur)} so far` : <span className="text-muted">$0 so far</span>}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

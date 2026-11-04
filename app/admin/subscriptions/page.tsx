import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { loadMoneyData } from "@/lib/money-data";
import {
  deriveSubscriptions,
  subFilterFrom,
  subTotals,
  listRows,
  chipCounts,
  trialNote,
  SUB_CHIPS,
  type SubChip,
  type SubFilter,
  type SubPreset,
} from "@/lib/subscriptions-view";
import { deriveTrials, trialsOf, trialsByWeek } from "@/lib/trials-view";
import { money } from "@/lib/money";
import { Tile, Chip, Pill, fmtDate, Soon, Th, Empty } from "@/components/admin/money-ui";

/**
 * Subscriptions: Trials and Renewals on one page (asked 4 Nov 2026). One date
 * range: what came in before today, what is expected after it. Spec:
 * docs/superpowers/specs/2026-11-04-subscriptions-page-design.md.
 */
const CHIP_LABEL: Record<"all" | SubChip, string> = {
  all: "All",
  active: "Active",
  trial: "On trial",
  free: "Free access",
  "past-due": "Past due",
  cancelling: "Cancelling",
  ended: "Ended",
};
const CHIP_TONE: Record<SubChip, "good" | "warn" | "bad" | "quiet"> = {
  active: "good",
  trial: "warn",
  free: "quiet",
  "past-due": "bad",
  cancelling: "bad",
  ended: "quiet",
};
const PRESETS: { key: Exclude<SubPreset, "custom">; label: string }[] = [
  { key: "around", label: "Around today" },
  { key: "last-30", label: "Last 30 days" },
  { key: "this-month", label: "This month" },
  { key: "next-30", label: "Next 30 days" },
];

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [, data] = await Promise.all([requireAdmin(), loadMoneyData()]);
  const now = data.now;
  const today = now.toISOString().slice(0, 10);
  const raw = subFilterFrom(sp, today);
  const all = deriveSubscriptions(data);
  const things = [...new Map(all.map((r) => [r.offerId ?? r.productId ?? "", r.what])).entries()]
    .filter(([id]) => id)
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Whitelisted against what actually has a subscription, never parsed.
  const filter: SubFilter = { ...raw, offer: things.some((t) => t.id === raw.offer) ? raw.offer : "" };
  const t = subTotals(all, filter, now);
  const counts = chipCounts(all, filter, now);
  const rows = listRows(all, filter, now);
  const cur = t.currency;
  const weeks = trialsByWeek(trialsOf(deriveTrials(data), filter.offer));

  const href = (patch: Partial<SubFilter>) => {
    const n = { ...filter, ...patch };
    const p = new URLSearchParams();
    if (n.preset === "custom") {
      p.set("from", n.from);
      p.set("to", n.to);
    } else if (n.preset !== "around") p.set("preset", n.preset);
    if (n.offer) p.set("offer", n.offer);
    if (n.state !== "all") p.set("state", n.state);
    if (n.sort !== "date") p.set("sort", n.sort);
    const q = p.toString();
    return `/admin/subscriptions${q ? `?${q}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Subscriptions</h1>
        <p className="max-w-2xl text-sm text-muted">
          What came in and what is coming, for the dates you pick. Before today is money collected; from today on is what Stripe is expected to charge.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Chip key={p.key} href={href({ preset: p.key })} active={filter.preset === p.key}>{p.label}</Chip>
          ))}
        </div>
        <form method="get" className="flex flex-wrap items-center gap-2">
          {filter.state !== "all" && <input type="hidden" name="state" value={filter.state} />}
          {filter.sort !== "date" && <input type="hidden" name="sort" value={filter.sort} />}
          <input type="date" name="from" defaultValue={filter.from} aria-label="From" className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs" />
          <span className="text-xs text-muted">to</span>
          <input type="date" name="to" defaultValue={filter.to} aria-label="To" className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs" />
          <select name="offer" defaultValue={filter.offer} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
            <option value="">Any product or offer</option>
            {things.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <button className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:border-primary">Apply</button>
          <span className="text-xs text-muted">{fmtDate(`${filter.from}T00:00:00Z`)} to {fmtDate(`${filter.to}T00:00:00Z`)}</span>
        </form>
      </div>

      <div className="flex flex-wrap gap-2.5">
        {t.collectedCents != null && (
          <Tile label="Collected" value={money(t.collectedCents, cur)} hint={`${fmtDate(`${filter.from}T00:00:00Z`)} to today`} />
        )}
        {t.expectedCents != null && (
          <Tile
            label="Expected"
            value={money(t.expectedCents, cur)}
            hint={
              <>
                today to {fmtDate(`${filter.to}T00:00:00Z`)}
                {t.unknown ? `, plus ${t.unknown} not yet known` : ""}
                <span className="block">Later charges at list price, assuming nobody cancels.</span>
              </>
            }
          />
        )}
        <Tile label="Running now" value={String(t.running.total)} hint={`${t.running.paying} paying, ${t.running.cancelling} cancelling, ${t.running.pastDue} past due`} />
        <Tile
          label="On trial now"
          value={String(t.onTrial)}
          hint={t.endingThisWeek ? `${t.endingThisWeek} end this week` : "none ending this week"}
          tone={t.endingThisWeek ? "warn" : undefined}
        />
        <Tile
          label="Trials converted in range"
          value={String(t.converted)}
          hint={`${t.rate == null ? "none settled" : `${t.rate}% of ${t.converted + t.lost} that ended`}${t.free ? `, ${t.free} free access` : ""}`}
        />
        <Tile
          label="Ended in range"
          value={String(t.ended)}
          hint={t.setToCancel ? `${t.setToCancel} set to cancel, first ${fmtDate(t.setToCancelFirst)}` : "none set to cancel"}
          tone={t.setToCancel ? "bad" : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...SUB_CHIPS] as const).map((c) => (
          <Chip key={c} href={href({ state: c })} active={filter.state === c} count={counts[c]}>{CHIP_LABEL[c]}</Chip>
        ))}
        <Link href={href({ sort: filter.sort === "date" ? "amount" : "date" })} className="ml-auto text-xs text-muted hover:text-fg">
          {filter.sort === "date" ? "Soonest charge first · sort by amount" : "Biggest charge first · sort by date"}
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-surface-2">
            <tr><Th>Person</Th><Th>Subscription</Th><Th>Next charge</Th><Th right>Amount</Th><Th>Started</Th><Th right>Paid so far</Th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6}><Empty>Nothing happened to a subscription in these dates.</Empty></td></tr>
            ) : (
              rows.map((r) => {
                const note = trialNote(r, now);
                return (
                  <tr key={r.stripeSubscriptionId} className="border-t border-border align-top hover:bg-surface-2">
                    <td className="px-3 py-3">
                      {r.userId ? <Link href={`/admin/members/${r.userId}`} className="font-medium hover:text-primary">{r.name || r.email}</Link> : <span className="font-medium">{r.name || r.email}</span>}
                      {r.name && <div className="text-xs text-muted">{r.email}</div>}
                    </td>
                    <td className="px-3 py-3">
                      {r.what}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Pill tone={CHIP_TONE[r.chip]}>{r.state}</Pill>
                        {note && <span className="text-xs text-muted">{note}</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {r.chip === "past-due" ? (
                        <span className="font-medium text-primary">overdue</span>
                      ) : r.nextChargeAt ? (
                        <Soon iso={r.nextChargeAt} now={now} />
                      ) : r.cancelsAt ? (
                        <span className="text-muted">ends {fmtDate(r.cancelsAt)}</span>
                      ) : r.endedAt ? (
                        <span className="text-muted">ended {fmtDate(r.endedAt)}</span>
                      ) : (
                        <span className="text-muted">none</span>
                      )}
                      {r.nextChargeAt && <div className="text-xs text-muted">{fmtDate(r.nextChargeAt)}</div>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {r.nextChargeAt ? (
                        <>
                          <span className="font-display tabular-nums">
                            {r.nextChargeCents == null ? <span className="text-muted">unknown</span> : money(r.nextChargeCents, r.currency)}
                          </span>
                          {r.nextChargeCents != null && r.nextChargeCents !== r.priceCents && (
                            <div className="text-xs text-muted">price {money(r.priceCents, r.currency)}</div>
                          )}
                          {r.nextChargeNote && <div className="ml-auto max-w-[14rem] text-xs text-muted">{r.nextChargeNote}</div>}
                        </>
                      ) : (
                        <span className="text-muted">{money(r.priceCents, r.currency)}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{fmtDate(r.startedAt)}</td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-display tabular-nums">{money(r.paidTotalCents, r.currency)}</span>
                      <div className="text-xs text-muted">{r.paidInvoices} payment{r.paidInvoices === 1 ? "" : "s"}</div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">By the week they started</h2>
        <p className="text-xs text-muted">Every trial, by the week it began. Green paid, red did not, amber still on trial, grey free access.</p>
        {weeks.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No trials yet.</p>
        ) : (
          <ul className="mt-2">
            {weeks.map((w) => {
              const pct = (n: number) => Math.round((n / w.started) * 100);
              const sentence = w.pending === w.started ? `${w.started} started, all still on trial` : `${w.started} started: ${w.converted} paid, ${w.lost} did not${w.free ? `, ${w.free} on free access` : ""}${w.pending ? `, ${w.pending} still deciding` : ""}`;
              return (
                <li key={w.weekStart} className="grid grid-cols-[10.5rem_1fr_auto] items-center gap-3 border-t border-border py-2.5 text-sm first:border-t-0">
                  <span className="whitespace-nowrap text-muted">Week of {fmtDate(w.weekStart)}</span>
                  <span>
                    {sentence}
                    <span className="mt-1 flex h-1.5 overflow-hidden rounded bg-surface-2">
                      <i className="block bg-emerald-600" style={{ width: `${pct(w.converted)}%` }} />
                      <i className="block bg-primary" style={{ width: `${pct(w.lost)}%` }} />
                      <i className="block bg-amber-500" style={{ width: `${pct(w.pending)}%` }} />
                      <i className="block bg-muted/40" style={{ width: `${pct(w.free)}%` }} />
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

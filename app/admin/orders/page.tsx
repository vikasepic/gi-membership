import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { listProductOptions, listOfferOptions } from "@/lib/admin";
import { loadMoneyData } from "@/lib/money-data";
import {
  deriveLedger,
  applyLedgerFilter,
  ledgerFilterFrom,
  ledgerHref,
  ledgerTotals,
  breakdown,
  sourcesIn,
  LEDGER_KINDS,
  type LedgerFilter,
  type Range,
} from "@/lib/ledger";
import { money } from "@/lib/money";
import { RefundButton } from "@/components/admin/refund-button";
import { Tile, Chip, Pill, kindTone, KIND_LABEL, fmtDate, fmtTime, Soon, Th, Empty } from "@/components/admin/money-ui";

/**
 * Transactions: every time money moved or was promised, one row each —
 * first purchases, renewals, add-ons, upsells, trials, refunds,
 * cancellations. Totals follow the filter; beside the list, what it adds
 * up to by product and by source.
 */
const RANGES: { key: Range; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "mtd", label: "This month" },
  { key: "all", label: "All time" },
];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filter = ledgerFilterFrom(await searchParams);
  const [, data, products, offers] = await Promise.all([requireAdmin(), loadMoneyData(), listProductOptions(), listOfferOptions()]);
  const all = deriveLedger(data);
  const shown = applyLedgerFilter(all, filter, data.now);
  const t = ledgerTotals(shown);
  const cur = t.currency;
  const things = [...products.map((p) => ({ id: p.id, name: p.title })), ...offers.map((o) => ({ id: o.id, name: o.name }))];
  const sources = sourcesIn(all);
  const href = (patch: Partial<LedgerFilter>) => ledgerHref(filter, patch);
  const toggleKind = (k: LedgerFilter["kinds"][number]) => (filter.kinds.includes(k) ? filter.kinds.filter((x) => x !== k) : [...filter.kinds, k]);
  let lastDay = "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Transactions</h1>
        <p className="max-w-2xl text-sm text-muted">
          Every time money moved, or was promised: first purchases, renewals, add-ons, upsells, trials and refunds, one row each. Totals follow the filter. Refunding here also removes access and cancels any subscription the purchase started.
        </p>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Tile label="Gross" value={money(t.grossCents, cur)} hint={`${t.payments} payment${t.payments === 1 ? "" : "s"}`} />
        <Tile label="Refunds" value={money(t.refundCents, cur)} hint={t.refunds ? `${t.refunds}` : undefined} />
        <Tile label="Net" value={money(t.netCents, cur)} />
        <Tile label="Renewals" value={String(t.renewals)} hint={money(t.renewalCents, cur)} />
        <Tile label="New customers" value={String(t.newCustomers)} hint="first purchase or trial" />
        <Tile label="Trials started" value={String(t.trialsStarted)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <Chip key={r.key} href={href({ range: r.key })} active={filter.range === r.key}>{r.label}</Chip>
        ))}
        <span className="mx-1 text-border">|</span>
        {LEDGER_KINDS.map((k) => (
          <Chip key={k.key} href={href({ kinds: toggleKind(k.key) })} active={filter.kinds.includes(k.key)}>{k.label}</Chip>
        ))}
        <Chip href={href({ live: !filter.live })} active={filter.live}>Live only</Chip>
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2">
        {filter.range !== "30" && <input type="hidden" name="range" value={filter.range} />}
        {filter.kinds.length > 0 && <input type="hidden" name="kind" value={filter.kinds.join(",")} />}
        {!filter.live && <input type="hidden" name="live" value="0" />}
        <select name="offer" defaultValue={filter.offer} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
          <option value="">Any product or offer</option>
          {things.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <select name="source" defaultValue={filter.source} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
          <option value="">Any source</option>
          {sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="flex-1" />
        <input name="q" defaultValue={filter.q} placeholder="Search person" className="min-w-[14rem] rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs" />
        <button type="submit" className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:border-primary">Apply</button>
        {(filter.q || filter.offer || filter.source) && <Link href={href({ q: "", offer: "", source: "" })} className="text-xs text-muted hover:text-fg">Clear</Link>}
      </form>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(16rem,1fr)]">
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-surface-2"><tr><Th>When</Th><Th>Person</Th><Th>What</Th><Th>Source</Th><Th right>Amount</Th><Th /></tr></thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={6}><Empty>Nothing in this range.</Empty></td></tr>
              ) : (
                shown.flatMap((r) => {
                  const day = fmtDate(r.at);
                  const head = day !== lastDay ? [<tr key={`d:${day}`} className="bg-surface-2"><td colSpan={6} className="px-3 py-1 kicker text-muted">{day}</td></tr>] : [];
                  lastDay = day;
                  return [
                    ...head,
                    <tr key={r.id} className="border-t border-border align-top hover:bg-surface-2">
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{fmtTime(r.at)}</td>
                      <td className="px-3 py-3">
                        {r.userId ? <Link href={`/admin/members/${r.userId}`} className="font-medium hover:text-primary">{r.name || r.email}</Link> : <span className="font-medium">{r.name || r.email}</span>}
                        {r.name && <div className="text-xs text-muted">{r.email}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <Pill tone={kindTone(r.kind)}>{KIND_LABEL[r.kind]}</Pill> {r.what}
                        {!r.livemode && <> <Pill tone="quiet">test</Pill></>}
                        {r.refunded && r.kind !== "refund" && <> <Pill tone="bad">refunded</Pill></>}
                        {r.trial && (
                          <div className="mt-1 text-xs text-muted">
                            {money(r.trial.thenCents, r.currency)} a {r.trial.interval ?? "month"} after ·{" "}
                            {r.trial.outcome === "on trial" && r.trial.endsAt ? <>ends <Soon iso={r.trial.endsAt} now={data.now} /> ({fmtDate(r.trial.endsAt)})</> : <>{r.trial.outcome}{r.trial.outcomeAt ? ` ${fmtDate(r.trial.outcomeAt)}` : ""}</>}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted">{r.source}</td>
                      <td className={`whitespace-nowrap px-3 py-3 text-right font-display tabular-nums ${r.amountCents < 0 ? "text-primary" : r.amountCents === 0 ? "text-muted" : ""}`}>
                        {r.amountCents === 0 ? "$0" : money(r.amountCents, r.currency)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {(r.kind === "purchase" || r.kind === "upsell" || r.kind === "renewal") && r.orderId && !r.refunded && r.amountCents > 0 && (
                          <RefundButton orderId={r.orderId} email={r.email} amount={money(r.amountCents, r.currency)} />
                        )}
                      </td>
                    </tr>,
                  ];
                })
              )}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted">
            <span>{t.rows} rows · net {money(t.netCents, cur)}</span>
            <a href={`/admin/orders/export${href({}).replace("/admin/orders", "")}`} className="rounded-lg border border-border bg-surface px-3 py-1.5 hover:border-primary">Export CSV</a>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Breakdown title="By product or offer" rows={breakdown(shown, (r) => r.what)} cur={cur} />
          <Breakdown title="By source" rows={breakdown(shown.filter((r) => r.source), (r) => r.source)} cur={cur} />
        </div>
      </div>
    </div>
  );
}

function Breakdown({ title, rows, cur }: { title: string; rows: { name: string; count: number; netCents: number }[]; cur: string }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Nothing here.</p>
      ) : (
        <table className="mt-2 w-full text-xs">
          <tbody>
            {rows.map((b) => (
              <tr key={b.name} className="border-t border-border first:border-t-0">
                <td className="py-1.5 pr-2">{b.name}</td>
                <td className="py-1.5 text-right tabular-nums text-muted">{b.count}</td>
                <td className="py-1.5 pl-2 text-right font-display tabular-nums">{money(b.netCents, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

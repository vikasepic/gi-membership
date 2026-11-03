import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { loadMoneyData } from "@/lib/money-data";
import {
  deriveRenewals,
  renewalTotals,
  renewalFilterFrom,
  applyRenewalFilter,
  RENEWAL_KINDS,
  WINDOW_DAYS,
  type RenewalFilter,
  type RenewalKind,
} from "@/lib/renewals-view";
import { money } from "@/lib/money";
import { Tile, Chip, Pill, fmtDate, Soon, Th, Empty } from "@/components/admin/money-ui";

/**
 * Renewals: what Stripe will charge over the next 30 days, and who. The
 * amounts are Stripe's own previews, so a coupon is already in them.
 */
const LABEL: Record<RenewalKind, string> = {
  renewal: "Renewals",
  "trial converting": "Trials converting",
  "past due": "Past due",
  cancelling: "Cancelling",
};
const TONE: Record<RenewalKind, "good" | "warn" | "bad"> = {
  renewal: "good",
  "trial converting": "warn",
  "past due": "bad",
  cancelling: "bad",
};

export default async function RenewalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = renewalFilterFrom(await searchParams);
  const [, data] = await Promise.all([requireAdmin(), loadMoneyData()]);
  const all = deriveRenewals(data);
  const things = [...new Map(all.map((r) => [r.offerId ?? r.productId ?? "", r.what])).entries()]
    .filter(([id]) => id)
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // The offer is whitelisted against what is actually in the window.
  const filter: RenewalFilter = { ...raw, offer: things.some((t) => t.id === raw.offer) ? raw.offer : "" };
  const inOffer = applyRenewalFilter(all, { ...filter, kind: "all" });
  const t = renewalTotals(inOffer);
  const rows = applyRenewalFilter(all, filter);
  const cur = t.currency;

  const href = (patch: Partial<RenewalFilter>) => {
    const n = { ...filter, ...patch };
    const p = new URLSearchParams();
    if (n.kind !== "all") p.set("kind", n.kind);
    if (n.offer) p.set("offer", n.offer);
    if (n.sort !== "date") p.set("sort", n.sort);
    const q = p.toString();
    return `/admin/renewals${q ? `?${q}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Renewals</h1>
        <p className="max-w-2xl text-sm text-muted">
          What Stripe will charge in the next {WINDOW_DAYS} days, and who. Amounts are Stripe&apos;s own preview of each invoice, so discounts are already in them. The numbers follow the product filter.
        </p>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Tile
          label={`Coming in, next ${WINDOW_DAYS} days`}
          value={money(t.comingInCents, cur)}
          hint={[t.pastDue.count ? `includes ${money(t.pastDue.cents, cur)} past due` : "", t.unknown ? `plus ${t.unknown} not yet known` : ""].filter(Boolean).join(", ") || undefined}
        />
        <Tile label="Renewals" value={String(t.renewals.count)} hint={money(t.renewals.cents, cur)} />
        <Tile label="Trials converting" value={String(t.trials.count)} hint={money(t.trials.cents, cur)} />
        {t.pastDue.count > 0 && <Tile label="Past due" value={String(t.pastDue.count)} hint={`${money(t.pastDue.cents, cur)}, Stripe is retrying`} tone="warn" />}
        <Tile label="Cancelling" value={String(t.cancelling.count)} hint={t.cancelling.count ? `${money(t.cancelling.cents, cur)} not coming` : "none"} tone={t.cancelling.count ? "bad" : undefined} />
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2">
        {filter.kind !== "all" && <input type="hidden" name="kind" value={filter.kind} />}
        <select name="offer" defaultValue={filter.offer} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
          <option value="">Any product or offer</option>
          {things.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <select name="sort" defaultValue={filter.sort} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
          <option value="date">Soonest first</option>
          <option value="amount">Biggest first</option>
        </select>
        <button className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:border-primary">Apply</button>
        {filter.offer && <Link href={href({ offer: "" })} className="text-xs text-muted hover:text-fg">Clear</Link>}
      </form>

      <div className="flex flex-wrap gap-2">
        <Chip href={href({ kind: "all" })} active={filter.kind === "all"} count={inOffer.length}>All</Chip>
        {RENEWAL_KINDS.map((k) => (
          <Chip key={k} href={href({ kind: k })} active={filter.kind === k} count={inOffer.filter((r) => r.kind === k).length}>
            {LABEL[k]}
          </Chip>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-surface-2">
            <tr><Th>Person</Th><Th>Subscription</Th><Th>Charges</Th><Th right>Amount</Th><Th>Started</Th><Th right>Paid so far</Th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6}><Empty>Nothing in the next {WINDOW_DAYS} days.</Empty></td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.stripeSubscriptionId} className="border-t border-border align-top hover:bg-surface-2">
                  <td className="px-3 py-3">
                    {r.userId ? <Link href={`/admin/members/${r.userId}`} className="font-medium hover:text-primary">{r.name || r.email}</Link> : <span className="font-medium">{r.name || r.email}</span>}
                    {r.name && <div className="text-xs text-muted">{r.email}</div>}
                  </td>
                  <td className="px-3 py-3">
                    {r.what}
                    <div className="mt-1"><Pill tone={TONE[r.kind]}>{r.kind}</Pill></div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {r.kind === "past due" ? <span className="text-primary font-medium">overdue</span> : <Soon iso={r.at} now={data.now} />}
                    <div className="text-xs text-muted">{r.kind === "cancelling" ? `ends ${fmtDate(r.at)}` : fmtDate(r.at)}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="font-display tabular-nums">
                      {r.kind === "cancelling" ? <span className="text-muted line-through">{money(r.priceCents, r.currency)}</span> : r.amountCents == null ? <span className="text-muted">unknown</span> : money(r.amountCents, r.currency)}
                    </span>
                    {r.kind !== "cancelling" && r.amountCents != null && r.amountCents !== r.priceCents && (
                      <div className="text-xs text-muted">price {money(r.priceCents, r.currency)}</div>
                    )}
                    {r.note && <div className="ml-auto max-w-[14rem] text-xs text-muted">{r.note}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">{fmtDate(r.startedAt)}</td>
                  <td className="px-3 py-3 text-right">
                    <span className="font-display tabular-nums">{money(r.paidTotalCents, r.currency)}</span>
                    <div className="text-xs text-muted">{r.paidInvoices} payment{r.paidInvoices === 1 ? "" : "s"}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import Link from "next/link";
import { requireViewer, adminEmails } from "@/lib/admin-guard";
import { loadMoneyData } from "@/lib/money-data";
import { deriveJourneys, journeyRangeFrom, JOURNEY_RANGES, type BuyerPurchase } from "@/lib/buyer-journeys";
import { money } from "@/lib/money";
import { ClickableRow } from "@/components/admin/clickable-row";
import { Tile, Chip, Pill, fmtDate, fmtTime, Th, Empty } from "@/components/admin/money-ui";

/**
 * Journeys: what each buyer bought first, what they bought later, and what
 * they have spent in all.
 *
 * Built for the ads team (17 Nov 2026), who needed "bought the Validator,
 * then Foundations Weekend" and could not read it from ActiveCampaign tags.
 * A tag says a person has a product, not when they got it or whether they
 * paid. This page is open to an admin and to a read-only person, and has
 * nothing on it that changes anything. The rules are in lib/buyer-journeys.ts.
 */
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "0%");

export default async function JourneysPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [, data, sp] = await Promise.all([requireViewer(), loadMoneyData(), searchParams]);
  const range = journeyRangeFrom(sp);
  const { people, summary, laterColumns } = deriveJourneys(data, { range, teamEmails: adminEmails() });
  const href = (r: string) => (r === "all" ? "/admin/journeys" : `/admin/journeys?range=${r}`);
  const cur = people[0]?.currency ?? "usd";
  const again = people.filter((p) => p.later.length > 0).length;
  const mean = (ns: number[]) => (ns.length ? Math.round(ns.reduce((n, v) => n + v, 0) / ns.length) : 0);
  // A second purchase on the same day says "same visit", which a date alone hides.
  const when = (p: BuyerPurchase, first: BuyerPurchase) => (fmtDate(p.at) === fmtDate(first.at) ? `${fmtDate(p.at)}, ${fmtTime(p.at)}` : fmtDate(p.at));

  return (
    <div className="admin-wide flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Journeys</h1>
        <p className="max-w-2xl text-sm text-muted">
          What each buyer bought first, what they went on to buy, and what they have spent in all. A bump or an upsell taken at checkout counts with that purchase. A free trial counts once it has taken a payment. Access that was given is shown, never counted.
        </p>
        <p className="max-w-2xl text-xs text-muted">Sales made on Grow since 12 Aug 2026. Book Writer and anything sold elsewhere is not included.</p>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Tile label="Buyers" value={String(people.length)} hint="by first purchase in the range" />
        <Tile label="Bought again later" value={String(again)} hint={`${pct(again, people.length)} of buyers`} />
        <Tile label="Avg first purchase" value={money(mean(people.map((p) => p.first.valueCents)), cur)} hint="bumps and upsells included" />
        <Tile label="Avg total spent" value={money(mean(people.map((p) => p.totalSpentCents)), cur)} hint="per buyer, renewals included" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {JOURNEY_RANGES.map((r) => (
          <Chip key={r.key} href={href(r.key)} active={range === r.key}>{r.label}</Chip>
        ))}
        <span className="flex-1" />
        <a href={`/admin/journeys/export${range === "all" ? "" : `?range=${range}`}`} className="rounded-lg border border-border bg-surface px-3 py-1.5 hover:border-primary">Download CSV</a>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">By first purchase</h2>
        <p className="text-xs text-muted">Each row is the people who bought that first. The columns to the right of the line are what they bought later, as a count and a share of the row.</p>
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2">
              <tr>
                <Th>First purchase</Th><Th right>Buyers</Th><Th right>Avg first purchase</Th><Th right>Bought again later</Th><Th right>Avg total spent</Th>
                {laterColumns.map((c, i) => (
                  <th key={c.key} title={c.what} className={`min-w-[8.5rem] max-w-[11rem] px-3 py-2.5 text-right align-bottom kicker text-muted ${i === 0 ? "border-l border-border" : ""}`}>
                    {/* Wide enough to read a product's name; the table scrolls sideways in its own box. */}
                    <span className="line-clamp-3">Then {c.what}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.length === 0 ? (
                <tr><td colSpan={5 + laterColumns.length}><Empty>Nobody made a first purchase in this range. Try All time.</Empty></td></tr>
              ) : (
                summary.map((r) => (
                  <tr key={r.key} className="border-t border-border">
                    <td className="min-w-[14rem] px-3 py-3 font-medium">{r.what}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.buyers}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{money(r.avgFirstValueCents, cur)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">
                      {r.boughtAgain} <span className="text-xs text-muted">{pct(r.boughtAgain, r.buyers)}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-display tabular-nums">{money(r.avgTotalSpentCents, cur)}</td>
                    {laterColumns.map((c, i) => {
                      const n = r.laterBy[c.key] ?? 0;
                      return (
                        <td key={c.key} className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${i === 0 ? "border-l border-border" : ""}`}>
                          {n > 0 && <>{n} <span className="text-xs text-muted">{pct(n, r.buyers)}</span></>}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">People</h2>
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="bg-surface-2">
              <tr>
                <Th>Buyer</Th><Th>First purchase</Th><Th>Then bought</Th><Th>Not counted</Th><Th right>Total spent</Th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 ? (
                <tr><td colSpan={5}><Empty>No buyers in this range.</Empty></td></tr>
              ) : (
                people.map((p) => (
                  <ClickableRow key={p.personKey} href={p.userId ? `/admin/members/${p.userId}` : null} className="border-t border-border align-top hover:bg-surface-2">
                    <td className="max-w-[14rem] px-3 py-3">
                      {p.userId ? (
                        <Link href={`/admin/members/${p.userId}`} className="block truncate font-medium hover:text-primary" title={p.name || p.email}>{p.name || p.email}</Link>
                      ) : (
                        <span className="block truncate font-medium" title={p.email}>{p.email}</span>
                      )}
                      {p.name && <div className="truncate text-xs text-muted" title={p.email}>{p.email}</div>}
                    </td>
                    <td className="min-w-[14rem] px-3 py-3">
                      <div>{p.first.what} <span className="text-xs text-muted">{money(p.first.valueCents, p.currency)}</span></div>
                      <div className="text-xs text-muted">
                        {fmtDate(p.first.at)} · <span title={p.source}>{p.source}</span>
                      </div>
                      {p.first.withIt.length > 0 && <div className="mt-0.5 text-xs text-muted">with {p.first.withIt.join(", ")}</div>}
                    </td>
                    <td className="min-w-[14rem] px-3 py-3">
                      {p.later.length === 0 ? (
                        <span className="text-xs text-muted">—</span>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {p.later.map((l) => (
                            <li key={l.orderId}>
                              {l.what} <span className="text-xs text-muted">{money(l.valueCents, p.currency)} · {when(l, p.first)}</span>
                              {l.withIt.length > 0 && <div className="text-xs text-muted">with {l.withIt.join(", ")}</div>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="min-w-[12rem] px-3 py-3 text-xs text-muted">
                      {p.startedFree.map((f, i) => (
                        <div key={`f${i}`}><Pill tone="quiet">started free</Pill> {f.what} · {fmtDate(f.at)}</div>
                      ))}
                      {p.given.map((g, i) => (
                        <div key={`g${i}`}><Pill tone="quiet">given</Pill> {g.what}{g.at ? ` · ${fmtDate(g.at)}` : ""}</div>
                      ))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-display tabular-nums">{money(p.totalSpentCents, p.currency)}</td>
                  </ClickableRow>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

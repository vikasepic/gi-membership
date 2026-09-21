import Link from "next/link";
import { requireAdmin, adminEmails } from "@/lib/admin-guard";
import { listProductOptions, listOfferOptions } from "@/lib/admin";
import { loadMoneyData } from "@/lib/money-data";
import {
  deriveMembers,
  applyMemberFilter,
  memberFilterFrom,
  memberHref,
  memberTiles,
  memberChipCounts,
  JOURNEYS,
  type MemberFilter,
} from "@/lib/member-money";
import { money } from "@/lib/money";
import { AddMember } from "@/components/admin/add-member";
import { Tile, Chip, Pill, journeyTone, fmtDate, Soon, Th, Empty } from "@/components/admin/money-ui";

/**
 * Members: who they are, where they are in their journey, what comes next
 * for them, and what they have paid us in total. Every tile follows the
 * filter — filtering to the trials tells you about the trials.
 */
const CHIPS: { key: MemberFilter["journey"]; label: string }[] = [
  { key: "all", label: "All" },
  ...JOURNEYS.map((j) => ({ key: j, label: j[0].toUpperCase() + j.slice(1) })),
  { key: "converted", label: "Converted" },
  { key: "admins", label: "Admins" },
];
const SORTS: { key: MemberFilter["sort"]; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "next", label: "Next event" },
  { key: "total", label: "Total paid" },
  { key: "last", label: "Last payment" },
];

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filter = memberFilterFrom(await searchParams);
  const [, data, products, offers] = await Promise.all([requireAdmin(), loadMoneyData(), listProductOptions(), listOfferOptions()]);
  const envAdmins = adminEmails();
  const all = deriveMembers(data);
  const shown = applyMemberFilter(all, filter, data.now, envAdmins);
  const tiles = memberTiles(shown, data.now);
  const counts = memberChipCounts(all, envAdmins);
  const grants = [
    ...products.map((p) => ({ value: `product:${p.id}`, label: `Product — ${p.title}` })),
    ...offers.map((o) => ({ value: `offer:${o.id}`, label: `Offer — ${o.name}` })),
  ];
  const things = [...products.map((p) => ({ id: p.id, name: p.title })), ...offers.map((o) => ({ id: o.id, name: o.name }))];
  const cur = tiles.currency;
  const active = (patch: Partial<MemberFilter>) => memberHref(filter, patch);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Members</h1>
        <p className="max-w-2xl text-sm text-muted">
          Everyone with an account, where they are in their journey, what happens to them next, and what they have paid in total. The numbers follow the filter.
        </p>
      </div>

      <details className="rounded-2xl border border-border bg-surface">
        <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">+ Add a member</summary>
        <div className="border-t border-border p-5"><AddMember grants={grants} /></div>
      </details>

      <div className="flex flex-wrap gap-2.5">
        <Tile label={shown.length === all.length ? "Members" : "Showing"} value={String(tiles.members)} hint={shown.length === all.length ? undefined : `of ${all.length}`} />
        <Tile label="Paying" value={String(tiles.paying)} hint={`${money(tiles.mrrCents, cur)} a month`} />
        <Tile label="On trial" value={String(tiles.onTrial)} hint={tiles.endingThisWeek ? `${tiles.endingThisWeek} end this week` : "none ending this week"} tone={tiles.endingThisWeek ? "warn" : undefined} />
        <Tile label="Converted this month" value={String(tiles.convertedThisMonth)} hint="trial → paid" />
        <Tile label="Cancelled this month" value={String(tiles.cancelledThisMonth)} />
        <Tile label="Collected" value={money(tiles.collectedCents, cur)} hint="all time, net of refunds" />
      </div>

      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <Chip key={c.key} href={active({ journey: c.key })} active={filter.journey === c.key} count={counts[c.key] ?? 0}>
            {c.label}
          </Chip>
        ))}
      </div>

      <form method="get" className="flex flex-wrap items-center gap-2">
        {filter.journey !== "all" && <input type="hidden" name="journey" value={filter.journey} />}
        <select name="offer" defaultValue={filter.offer} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
          <option value="">Any product or offer</option>
          {things.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${filter.soon ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface"}`}>
          <input type="checkbox" name="soon" value="1" defaultChecked={filter.soon} className="sr-only" />
          Next event within 7 days
        </label>
        <span className="flex-1" />
        <input name="q" defaultValue={filter.q} placeholder="Search name or email" className="min-w-[14rem] rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs" />
        <select name="sort" defaultValue={filter.sort} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs">
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <button type="submit" className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:border-primary">Apply</button>
        {(filter.q || filter.offer || filter.soon || filter.sort !== "newest") && (
          <Link href={active({ q: "", offer: "", soon: false, sort: "newest" })} className="text-xs text-muted hover:text-fg">Clear</Link>
        )}
      </form>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-surface-2">
            <tr>
              <Th>Member</Th><Th>Joined</Th><Th>Journey</Th><Th>Next event</Th><Th right>Payments</Th><Th right>Total paid</Th><Th>Last payment</Th><Th />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={8}><Empty>Nobody matches. Clear a filter to see everyone.</Empty></td></tr>
            ) : (
              shown.map((m) => (
                <tr key={m.id} className="border-t border-border align-top hover:bg-surface-2">
                  <td className="px-3 py-3">
                    <Link href={`/admin/members/${m.id}`} className="font-medium hover:text-primary">{m.name || m.email}</Link>
                    {m.name && <div className="text-xs text-muted">{m.email}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">{fmtDate(m.joinedAt)}<div className="text-xs text-muted">{m.source}</div></td>
                  <td className="px-3 py-3">
                    <Pill tone={journeyTone(m.journey)}>{m.journey}</Pill>
                    {m.converted && m.journey === "paying" && <> <Pill tone="good">converted</Pill></>}
                    {m.isAdmin && <> <Pill tone="quiet">admin</Pill></>}
                    {(m.subs.length > 0 || m.holds.length > 0) && (
                      <div className="mt-1 text-xs text-muted">{[...new Set([...m.subs.map((s) => s.name), ...m.holds])].join(", ")}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {m.nextEvent ? (
                      <>
                        {m.nextEvent.what} <Soon iso={m.nextEvent.at} now={data.now} />
                        <div className="text-xs text-muted">{fmtDate(m.nextEvent.at)} · {m.nextEvent.name}</div>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{m.payments}{m.refunds ? <span className="text-xs text-muted"> · {m.refunds} refund{m.refunds === 1 ? "" : "s"}</span> : null}</td>
                  <td className="px-3 py-3 text-right font-display tabular-nums">{money(m.totalPaidCents - m.refundedCents, m.currency)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{m.lastPaidAt ? fmtDate(m.lastPaidAt) : <span className="text-muted">never</span>}</td>
                  <td className="px-3 py-3 text-muted"><Link href={`/admin/members/${m.id}`} aria-label="Open">›</Link></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted">
          <span>{shown.length} people · {money(tiles.collectedCents, cur)} collected from them</span>
          <a href={`/admin/members/export${memberHref(filter, {}).replace("/admin/members", "")}`} className="rounded-lg border border-border bg-surface px-3 py-1.5 hover:border-primary">Export CSV</a>
        </div>
      </div>
    </div>
  );
}

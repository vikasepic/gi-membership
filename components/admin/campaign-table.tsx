import Link from "next/link";
import { money } from "@/lib/money";
import { formatCount as n } from "@/lib/traffic-funnel";
import type { CampaignRow } from "@/lib/visit-reports";

/**
 * Every campaign, and what it was worth.
 *
 * Direct and referral traffic are rows like any other. A table that showed
 * only paid traffic could not tell you what share of the store paid traffic
 * actually is, which is the first question anybody asks of one.
 */
const COLUMNS = [
  { key: "visits", label: "Visits" },
  { key: "checkouts", label: "Checkout" },
  { key: "orders", label: "Orders" },
  { key: "revenue", label: "Revenue" },
] as const;

export type CampaignSort = (typeof COLUMNS)[number]["key"];

export function CampaignTable({
  rows, sort, dir, hrefFor,
}: {
  rows: CampaignRow[];
  sort: CampaignSort;
  dir: "asc" | "desc";
  hrefFor: (sort: CampaignSort, dir: "asc" | "desc") => string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface px-5 py-10 text-center text-muted">
        No visits in this range yet. Visits are recorded from the day this shipped; nothing before it can be recovered.
      </p>
    );
  }
  const rate = (a: number, b: number) => (b === 0 ? "—" : `${Math.round((a / b) * 100)}%`);
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[62rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            <Th>Campaign</Th>
            {COLUMNS.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right text-[0.62rem] font-medium uppercase tracking-[0.12em] text-muted">
                <Link href={hrefFor(c.key, sort === c.key && dir === "desc" ? "asc" : "desc")} className="hover:text-fg">
                  {c.label}
                  {sort === c.key ? (dir === "desc" ? " ↓" : " ↑") : ""}
                </Link>
              </th>
            ))}
            <Th right>To checkout</Th>
            <Th right>To order</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-b-0">
              <td className="px-3 py-2.5">
                <span className="font-medium">{r.campaign}</span>
                <span className="block text-xs text-muted">
                  {r.source} · {r.medium}
                  {r.adset !== "—" && <> · {r.adset}</>}
                  {r.ad !== "—" && <> · {r.ad}</>}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{n(r.visits)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{n(r.checkouts)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{n(r.orders)}</td>
              {/* Single-currency store: the rollup aggregates across orders, so a
                  per-row currency would already be wrong once a second one exists. */}
              <td className="px-3 py-2.5 text-right tabular-nums">{money(r.revenueCents, "usd")}</td>
              <td className="px-3 py-2.5 text-right text-xs text-muted tabular-nums">{rate(r.checkouts, r.visits)}</td>
              <td className="px-3 py-2.5 text-right text-xs text-muted tabular-nums">{rate(r.orders, r.checkouts)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-2 text-[0.62rem] font-medium uppercase tracking-[0.12em] text-muted ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

import { money } from "@/lib/money";
import { formatCount as n } from "@/lib/traffic-funnel";
import type { SourceRow } from "@/lib/visit-reports";

/**
 * One ranked table: referrers or landing pages, never both — the page
 * renders two side by side. `direct` (referrers) and every landing path
 * (landing pages, which has no direct fallback — every visit landed
 * somewhere) are rows like any other, not filtered out.
 */
export function SourceTable({
  title,
  nameHeader,
  rows,
  rank,
}: {
  title: string;
  nameHeader: string;
  rows: SourceRow[];
  rank: "visits" | "orders";
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="rounded-2xl border border-border bg-surface px-5 py-10 text-center text-muted">
          Nothing yet in this range.
        </p>
      </div>
    );
  }

  // Stable: ties break on the row's own key so two rows with the same count
  // never swap order between renders.
  const value = (r: SourceRow) => (rank === "orders" ? r.orders : r.visits);
  const shown = [...rows].sort((a, b) => value(b) - value(a) || a.key.localeCompare(b.key));

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-medium">{title}</h2>
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <Th>{nameHeader}</Th>
              <Th right>Visits</Th>
              <Th right>Orders</Th>
              <Th right>Revenue</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="border-b border-border/60 last:border-b-0">
                <td className="px-3 py-2.5 font-medium">{r.key}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{n(r.visits)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{n(r.orders)}</td>
                {/* Single-currency store: see campaign-table.tsx's own note. */}
                <td className="px-3 py-2.5 text-right tabular-nums">{money(r.revenueCents, "usd")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

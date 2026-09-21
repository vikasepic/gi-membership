import { requireAdmin } from "@/lib/admin-guard";
import { loadMoneyData } from "@/lib/money-data";
import { deriveLedger, applyLedgerFilter, ledgerFilterFrom } from "@/lib/ledger";

/** The filtered ledger as CSV, the same rows the page shows. */
export async function GET(req: Request) {
  await requireAdmin();
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const data = await loadMoneyData();
  const rows = applyLedgerFilter(deriveLedger(data), ledgerFilterFrom(sp), data.now);
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["at", "name", "email", "kind", "what", "amount", "currency", "source", "livemode", "order_id", "subscription_id", "trial_ends", "trial_outcome"].join(","),
    ...rows.map((r) =>
      [r.at, r.name, r.email, r.kind, r.what, (r.amountCents / 100).toFixed(2), r.currency, r.source, r.livemode ? "live" : "test", r.orderId, r.stripeSubscriptionId, r.trial?.endsAt ?? "", r.trial?.outcome ?? ""]
        .map(cell)
        .join(","),
    ),
  ];
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="transactions-${data.now.toISOString().slice(0, 10)}.csv"` },
  });
}

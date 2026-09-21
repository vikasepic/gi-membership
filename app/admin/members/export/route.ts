import { requireAdmin, adminEmails } from "@/lib/admin-guard";
import { loadMoneyData } from "@/lib/money-data";
import { deriveMembers, applyMemberFilter, memberFilterFrom } from "@/lib/member-money";

/** The filtered members list as CSV, the same rows the page shows. */
export async function GET(req: Request) {
  await requireAdmin();
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const data = await loadMoneyData();
  const rows = applyMemberFilter(deriveMembers(data), memberFilterFrom(sp), data.now, adminEmails());
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["name", "email", "joined", "source", "journey", "converted", "next_event", "next_event_at", "payments", "refunds", "total_paid", "refunded", "last_payment", "holds"].join(","),
    ...rows.map((m) =>
      [
        m.name, m.email, m.joinedAt, m.source, m.journey, m.converted ? "yes" : "no",
        m.nextEvent?.what ?? "", m.nextEvent?.at ?? "", m.payments, m.refunds,
        (m.totalPaidCents / 100).toFixed(2), (m.refundedCents / 100).toFixed(2), m.lastPaidAt ?? "", m.holds.join("; "),
      ].map(cell).join(","),
    ),
  ];
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="members-${data.now.toISOString().slice(0, 10)}.csv"` },
  });
}

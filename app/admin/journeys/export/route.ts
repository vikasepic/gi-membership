import { requireViewer, adminEmails } from "@/lib/admin-guard";
import { loadMoneyData } from "@/lib/money-data";
import { deriveJourneys, journeyRangeFrom } from "@/lib/buyer-journeys";

/**
 * Journeys as CSV: one row per line (a purchase, what was bought with it, a
 * renewal, a free start, access that was given), so it pivots in a
 * spreadsheet. The same people the page shows for the range.
 */
export async function GET(req: Request) {
  await requireViewer();
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const data = await loadMoneyData();
  const { people } = deriveJourneys(data, { range: journeyRangeFrom(sp), teamEmails: adminEmails() });
  // A name is whatever a member typed at signup, and this file is opened in a
  // spreadsheet: a cell that starts like a formula is made plain text.
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const lines = [
    ["email", "name", "purchase_no", "date", "product", "how", "amount", "currency", "source_first", "source_last"].join(","),
    ...people.flatMap((p) =>
      p.lines.map((l) =>
        [l.email, l.name, l.purchaseNo, l.at, l.what, l.how, (l.amountCents / 100).toFixed(2), l.currency, l.sourceFirst, l.sourceLast].map(cell).join(","),
      ),
    ),
  ];
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="journeys-${data.now.toISOString().slice(0, 10)}.csv"` },
  });
}

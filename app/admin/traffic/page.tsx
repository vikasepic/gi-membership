import { trafficByPage, consentedVisitorCount } from "@/lib/traffic";
import { TrafficTable, CoverageNote } from "@/components/admin/traffic-table";

export const dynamic = "force-dynamic";

export default async function AdminTrafficPage() {
  const [rows, consented] = await Promise.all([trafficByPage(30), consentedVisitorCount(30)]);
  const counted = rows.reduce((n, r) => n + r.hits, 0);
  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl">Traffic</h1>
        <p className="text-muted">
          Every view of the last 30 days, counted on the server — including the visitors your
          pixel and GA4 never see. Expect these numbers to read higher than theirs.
        </p>
      </div>
      <CoverageNote counted={counted} consented={consented} />
      <TrafficTable rows={rows} />
    </div>
  );
}

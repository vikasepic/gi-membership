import { pageCountsSince, paidByProduct, productNames, consentedVisitorCount } from "@/lib/traffic";
import { buildFunnels, daysInRange, rangeFrom } from "@/lib/traffic-funnel";
import { FunnelCard, RangeTabs, OtherPages } from "@/components/admin/traffic-funnel";
import { CoverageNote } from "@/components/admin/traffic-table";

export const dynamic = "force-dynamic";

export default async function AdminTrafficPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const range = rangeFrom(await searchParams);
  const [counts, bought, names, consented] = await Promise.all([
    pageCountsSince(range),
    paidByProduct(range),
    productNames(),
    consentedVisitorCount(range),
  ]);
  const days = daysInRange(range, new Date().toISOString().slice(0, 10));
  const view = buildFunnels(counts, bought, names, days);

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl">Traffic</h1>
          <p className="text-muted">
            Counted on the server as each page renders, so this includes the visitors your pixel
            and GA4 never see. Expect it to read higher than theirs.
          </p>
        </div>
        <RangeTabs range={range} />
      </div>

      {view.counted === 0 ? (
        <p className="text-muted">
          No traffic counted yet. Views appear here as soon as somebody opens a sales page.
        </p>
      ) : (
        <>
          {/*
            Said out loud, above the numbers, because somebody will make a
            spending decision on the drop between two of these steps. The
            first three count VIEWS — one person reloading the sales page
            twice is two of them — and only the last counts people.
          */}
          <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
            The first three steps count <span className="font-medium text-fg">views, not people</span>
            : one visitor reloading a page counts twice. Only <span className="font-medium text-fg">Bought</span>{" "}
            counts people, from real paid orders. Read the drop between steps as a direction, not a
            conversion rate.
          </p>
          <CoverageNote counted={view.counted} consented={consented} />
          <div className="flex flex-col gap-4">
            {view.products.map((p) => (
              <FunnelCard key={p.slug} product={p} />
            ))}
          </div>
          <OtherPages pages={view.others} />
        </>
      )}
    </div>
  );
}

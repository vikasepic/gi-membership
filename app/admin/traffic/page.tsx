import {
  pageCountsSince,
  paidByProduct,
  productNames,
  consentedVisitorCount,
  todayUtc,
} from "@/lib/traffic";
import { buildFunnels, daysInRange, presetFrom, rangeOf } from "@/lib/traffic-funnel";
import { FunnelCard, PresetTabs, OtherPages } from "@/components/admin/traffic-funnel";
import { CoverageNote } from "@/components/admin/traffic-table";

export const dynamic = "force-dynamic";

export default async function AdminTrafficPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const preset = presetFrom(await searchParams);
  // One clock read for the whole request. Reading it again after the awaits
  // lets a request that crosses UTC midnight build a chart one day short of
  // the totals beside it — the disagreement b481969 closed.
  const today = todayUtc();
  const range = rangeOf(preset, today);
  const [counts, bought, names, consented] = await Promise.all([
    pageCountsSince(range),
    paidByProduct(range),
    productNames(),
    consentedVisitorCount(range),
  ]);
  const days = daysInRange(range);
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
        <PresetTabs preset={preset} />
      </div>

      {/*
        Not `counted === 0`: that is true whenever no VIEW was counted, and a
        product can sell in a window without one — a direct link, or a sale on
        a page counted before the product column existed. Gating on the views
        alone would render "nothing here" over real orders.
      */}
      {view.products.length === 0 && view.others.length === 0 ? (
        <p className="text-muted">
          Nothing counted in this window. Try a longer range, or check back once somebody opens a
          sales page.
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

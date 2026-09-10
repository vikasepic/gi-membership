import {
  pageCountsSince,
  paidByProduct,
  productNames,
  offerKeys,
  paidByOffer,
  consentedVisitorCount,
  todayUtc,
} from "@/lib/traffic";
import {
  buildFunnels,
  daysInRange,
  presetFrom,
  rangeOf,
  type FunnelOwner,
} from "@/lib/traffic-funnel";
import {
  overviewFilterFrom,
  overviewRows,
  applyOverview,
  sourcesIn,
  type LinkFilter,
} from "@/lib/traffic-overview";
import { PresetTabs } from "@/components/admin/traffic-funnel";
import { TrafficOverview } from "@/components/admin/traffic-overview";
import { CoverageNote } from "@/components/admin/traffic-table";

export const dynamic = "force-dynamic";

export default async function AdminTrafficPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Captured once: awaiting the same promise twice in one render is a latent
  // bug even where it happens to work, and both presetFrom and
  // overviewFilterFrom need the same params.
  const params = await searchParams;
  const preset = presetFrom(params);
  // One clock read for the whole request. Reading it again after the awaits
  // lets a request that crosses UTC midnight build a chart one day short of
  // the totals beside it — the disagreement b481969 closed.
  const today = todayUtc();
  const range = rangeOf(preset, today);
  const [counts, bought, names, offers, boughtOffers, consented] = await Promise.all([
    pageCountsSince(range),
    paidByProduct(range),
    productNames(),
    offerKeys(),
    paidByOffer(range),
    consentedVisitorCount(range),
  ]);
  // Products first: if a product slug and an offer key ever collided, the
  // product wins, which is the behaviour that existed before offers had
  // funnels at all.
  const owners: FunnelOwner[] = [
    ...names.map((n) => ({ key: n.slug, title: n.title, kind: "product" as const, hasUpsell: n.hasUpsell })),
    ...offers.map((o) => ({ key: o.key, title: o.name, kind: "offer" as const, hasUpsell: o.hasUpsell })),
  ];
  const days = daysInRange(range);
  const boughtRows = [...bought, ...boughtOffers];
  const view = buildFunnels(counts, boughtRows, owners, days);

  const filter = overviewFilterFrom(params);
  // Carries the preset alongside the rest of the filter so PresetTabs and
  // TrafficOverview build every link from one shared shape.
  const linkFilter: LinkFilter = { ...filter, preset };
  const rows = overviewRows(view);
  // The select's options always come from the WHOLE window: deriving them
  // from a source-narrowed set of rows would leave the chosen source as the
  // only option, with no way back to any other one.
  const sources = sourcesIn(rows);
  // Job 3 of the source filter is not hiding rows — it recomputes the steps,
  // the trend and the totals from that source's rows alone. Orders carry a
  // source now (orders.utm_last, bucketed by sourceOfOrder with the same
  // rules a view gets), so the fourth step is that source's own sales.
  const sourceView = filter.source
    ? buildFunnels(
        counts.filter((c) => c.source === filter.source),
        boughtRows.filter((b) => b.source === filter.source),
        owners,
        days,
      )
    : view;
  const shown = applyOverview(overviewRows(sourceView), filter);

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
        <PresetTabs filter={linkFilter} />
      </div>

      {/*
        Not `counted === 0`: that is true whenever no VIEW was counted, and a
        product can sell in a window without one — a direct link, or a sale on
        a page counted before the product column existed. Gating on the views
        alone would render "nothing here" over real orders.
      */}
      {view.funnels.length === 0 && view.others.length === 0 ? (
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
          <TrafficOverview rows={shown} filter={linkFilter} sources={sources} />
        </>
      )}
    </div>
  );
}

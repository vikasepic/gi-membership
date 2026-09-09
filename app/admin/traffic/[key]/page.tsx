import Link from "next/link";
import { notFound } from "next/navigation";
import {
  pageCountsSince,
  paidByProduct,
  paidByOffer,
  productNames,
  offerKeys,
  todayUtc,
} from "@/lib/traffic";
import {
  buildFunnels,
  daysInRange,
  presetFrom,
  rangeOf,
  type FunnelOwner,
} from "@/lib/traffic-funnel";
import { FunnelCard } from "@/components/admin/traffic-funnel";

export const dynamic = "force-dynamic";

/**
 * One funnel, at a URL.
 *
 * The card is the one the overview used to stack fourteen of. Shaped through
 * the same buildFunnels the table uses rather than a query of its own: a
 * second path would drift from the row that was clicked to reach it.
 *
 * No path shown here beside the title — FunnelCard already prints its own
 * owner's path (`/p/<slug>` or `/o/<key>`) next to its heading, and the same
 * card is what the overview stacks thirteen of; saying it twice on one screen
 * is the kind of thing that drifts the moment one of the two copies changes.
 */
export default async function TrafficFunnelPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key } = await params;
  const sp = await searchParams;
  const preset = presetFrom(sp);
  // One clock read for the whole request, as everywhere else on this screen.
  const today = todayUtc();
  const range = rangeOf(preset, today);

  const [counts, bought, names, offers, boughtOffers] = await Promise.all([
    pageCountsSince(range),
    paidByProduct(range),
    productNames(),
    offerKeys(),
    paidByOffer(range),
  ]);
  // Products first: if a product slug and an offer key ever collided, the
  // product wins, which is the behaviour that existed before offers had
  // funnels at all.
  const owners: FunnelOwner[] = [
    ...names.map((n) => ({ key: n.slug, title: n.title, kind: "product" as const })),
    ...offers.map((o) => ({ key: o.key, title: o.name, kind: "offer" as const })),
  ];
  const view = buildFunnels(counts, [...bought, ...boughtOffers], owners, daysInRange(range));
  const funnel = view.funnels.find((f) => f.key === key);
  if (!funnel) notFound();

  const back = preset === "30" ? "/admin/traffic" : `/admin/traffic?preset=${preset}`;

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-1">
        <Link href={back} className="kicker w-fit text-muted hover:text-fg">
          &larr; Traffic
        </Link>
        <h1 className="text-2xl">{funnel.title}</h1>
      </div>

      {/* The same sentence the overview carries, because somebody arriving
          from a shared link never read it there. */}
      <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
        The first three steps count <span className="font-medium text-fg">views, not people</span>:
        one visitor reloading a page counts twice. Only{" "}
        <span className="font-medium text-fg">Bought</span> counts people, from real paid orders.
        Read the drop between steps as a direction, not a conversion rate.
      </p>

      <FunnelCard funnel={funnel} />
    </div>
  );
}

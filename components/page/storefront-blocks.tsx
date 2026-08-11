import Link from "next/link";
import { BuyLink } from "@/components/buy-link";
import { ProductCard, type CatalogItem } from "@/components/product-card";
import type { Offer } from "@/lib/types";
import { money } from "@/lib/money";

/**
 * The three parts of the storefront that read live data.
 *
 * They are blocks so the home page can decide what it has and where, but they
 * are not built OUT of blocks: each one needs the catalogue and the viewer's
 * ownership, and the ownership check is what stops the store offering somebody
 * a thing they already pay for. That belongs in code.
 *
 * Everything here is presentational and synchronous. The page resolves the
 * data — prices, covers, deep links into a course, whether this reader already
 * owns each thing — and hands it over finished, so the renderer never has to be
 * async and the same components draw in a preview as on the page.
 */

/** Everything the storefront blocks need, resolved by the page. */
export type StoreRender = {
  products: CatalogItem[];
  memberships: MembershipView[];
  /** The one product to lead with, if the page wants a Featured block. */
  featured?: CatalogItem | null;
};

/** One subscription, with its link and ownership already worked out. */
export type MembershipView = {
  offer: Offer;
  href: string;
  owned: boolean;
};

export function CatalogBlock({
  store,
  title,
  columns,
  limit,
  showPrice,
}: {
  store: StoreRender;
  title: string;
  columns: number;
  limit: number;
  showPrice: boolean;
}) {
  const items = limit > 0 ? store.products.slice(0, limit) : store.products;
  // No products is not an error and not an empty box: it is a shop with nothing
  // on the shelves yet, and a heading over nothing is worse than silence.
  if (items.length === 0) return null;
  const cols =
    columns >= 4
      ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      : columns === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : columns === 2
          ? "sm:grid-cols-2"
          : "";
  return (
    <div className="flex flex-col gap-7">
      {title && <h2 className="text-xl md:text-2xl">{title}</h2>}
      <div className={`grid grid-cols-1 gap-5 ${cols}`}>
        {items.map((p, i) => (
          <ProductCard
            key={p.slug}
            item={showPrice ? p : { ...p, priceCents: 0 }}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}

export function MembershipsBlock({
  store,
  title,
  showOwned,
}: {
  store: StoreRender;
  title: string;
  /** Whether a member still sees the one they already have, marked Active. */
  showOwned: boolean;
}) {
  const items = showOwned ? store.memberships : store.memberships.filter((m) => !m.owned);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-7">
      {title && <h2 className="text-xl md:text-2xl">{title}</h2>}
      <div className="flex flex-col gap-10">
        {items.map((m) => (
          <MembershipCard key={m.offer.id} view={m} />
        ))}
      </div>
    </div>
  );
}

/**
 * A subscription told as a product: what it is, what you get, what it costs,
 * and what happens next.
 *
 * Deliberately not a ProductCard — a card in a grid says "one of several things
 * to browse", and this is the opposite of that.
 */
export function MembershipCard({ view }: { view: MembershipView }) {
  const { offer, href, owned } = view;
  const trial = offer.trialDays ?? 0;
  const price = money(offer.priceCents, offer.currency);
  return (
    <section
      id={`offer-${offer.key}`}
      className="grid grid-cols-1 gap-8 rounded-3xl border border-border bg-surface p-7 md:grid-cols-12 md:gap-10 md:p-10"
    >
      <div className="flex flex-col gap-5 md:col-span-7">
        <div className="flex flex-wrap items-center gap-3">
          <span className="kicker rounded-full bg-primary px-2.5 py-1 text-primary-fg">
            {offer.name.split("—")[0].trim()}
          </span>
          {trial > 0 && (
            <span className="kicker rounded-full border border-border px-2.5 py-1 text-navy">
              {trial} days free
            </span>
          )}
        </div>

        <h3 className="text-2xl leading-tight text-balance md:text-3xl">{offer.headline}</h3>
        {offer.description && <p className="max-w-prose text-muted">{offer.description}</p>}

        {offer.bullets.length > 0 && (
          <ul className="flex flex-col gap-2.5 pt-1">
            {offer.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col justify-between gap-6 border-t border-border pt-7 md:col-span-5 md:border-l md:border-t-0 md:pl-10 md:pt-0">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-4xl">{price}</span>
            {offer.interval && <span className="text-muted">/{offer.interval}</span>}
          </div>
          {/* Say the charge out loud. A trial that bills silently on day 8 is
              the single most complained-about pattern in subscriptions. */}
          <p className="text-sm text-muted">
            {trial > 0
              ? `Free for ${trial} days, then ${price} each ${offer.interval}. Cancel any time before then and you pay nothing.`
              : `Billed every ${offer.interval}. Cancel any time.`}
          </p>
        </div>

        {owned ? (
          <div className="flex flex-col gap-2">
            <span className="kicker text-plum">Active</span>
            <Link
              href="/library"
              className="w-fit rounded-full border border-border px-6 py-3 font-medium transition-colors hover:border-primary"
            >
              Open your library →
            </Link>
          </div>
        ) : (
          <BuyLink
            href={href}
            valueCents={offer.priceCents}
            currency={offer.currency}
            contentId={offer.key}
            className="w-fit rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            {offer.acceptLabel}
          </BuyLink>
        )}
      </div>
    </section>
  );
}

export function FeaturedBlock({
  store,
  title,
  note,
}: {
  store: StoreRender;
  title: string;
  note: string;
}) {
  const item = store.featured;
  if (!item) return null;
  return (
    <div className="flex flex-col gap-4">
      {title && <span className="kicker text-muted">{title}</span>}
      <ProductCard item={item} />
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  );
}

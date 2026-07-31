import Link from "next/link";
import { ProductCard, type CatalogItem } from "@/components/product-card";
import { listPublishedProducts, listSubscriptionOffers } from "@/lib/store";
import { viewerOwnership, accessHrefForProduct } from "@/lib/library";
import { isOfferEligible } from "@/lib/offers";
import { productDisplay, type ProductDisplay } from "@/lib/courses";
import { publicCoverUrl } from "@/lib/media";
import type { Product, Offer } from "@/lib/types";
import { money } from "@/lib/money";

// Storefront labels for each course type. Mirrors the catalog card.
const BADGE_LABEL: Record<NonNullable<CatalogItem["type"]>, string> = {
  video: "Video",
  audio: "Audio",
  pdf: "Guide",
  text: "Reading",
};

function toCard(
  p: Product,
  display: ProductDisplay | null,
  coverUrl: string | null,
  owned: boolean,
  accessHref?: string,
): CatalogItem {
  return {
    slug: p.slug,
    title: p.title,
    tagline: p.tagline ?? "",
    type: display?.type ?? null,
    coverUrl,
    priceCents: p.priceCents,
    owned,
    accessHref,
  };
}

export default async function Home() {
  const products = await listPublishedProducts();
  const featured = products[0];
  // Anonymous visitors own nothing, so this is an empty set and the store
  // renders exactly as before for them.
  const ownership = await viewerOwnership();
  const ownedIds = ownership.productIds;

  // Subscription offers shown as their own section. isOfferEligible is the same
  // check the checkout bump uses, so a member who already subscribes is shown
  // "Active", never a second sign-up that would bill them twice.
  const subscriptions = await listSubscriptionOffers();
  const ownedOfferIds = new Set(
    subscriptions.filter((o) => !isOfferEligible(o, ownership)).map((o) => o.id),
  );
  // Badge type comes from each product's course now, not the product itself.
  const display = await productDisplay(products.map((p) => p.id));
  const featuredOwned = featured ? ownedIds.has(featured.id) : false;
  const featuredBadge = featured ? (display.get(featured.id)?.type ?? null) : null;
  // A product's own image wins; otherwise it inherits its course's.
  const coverFor = (p: Product) =>
    publicCoverUrl(p.coverPath ?? display.get(p.id)?.coverPath ?? null);
  const featuredCover = featured ? coverFor(featured) : null;
  // Deep-link each owned product to its course; only owned ones are looked up,
  // so an anonymous visitor costs no extra queries.
  const accessHrefs = new Map(
    await Promise.all(
      products
        .filter((p) => ownedIds.has(p.id))
        .map(async (p) => [p.id, await accessHrefForProduct(p.id)] as const),
    ),
  );
  const featuredHref = featured ? accessHrefs.get(featured.id) : undefined;
  const fromPrice =
    products.length > 0 ? Math.min(...products.map((p) => p.priceCents)) : 0;

  return (
    <div className="flex flex-col gap-16 md:gap-24">
      {/* Hero — asymmetric editorial split on desktop, stacked on mobile. */}
      <section className="grid grid-cols-1 items-end gap-10 pt-2 md:grid-cols-12 md:gap-8 md:pt-8">
        <div className="rise flex flex-col gap-6 md:col-span-7">
          <div className="flex items-center gap-3">
            <span className="kicker text-primary">Greater Inside</span>
            <span className="h-px flex-1 bg-border" />
            <span className="kicker text-muted">Est. Store</span>
          </div>
          <h1 className="text-[2.05rem] leading-[1.08] tracking-tight text-balance sm:text-5xl sm:leading-[1.02] md:text-[4.2rem]">
            A store for the work that goes deeper.
          </h1>
          <p className="max-w-md text-lg text-muted">
            Field-tested guides, audio, and tools — with Content Engine when
            you&rsquo;re ready to keep the momentum.
          </p>
          <div className="flex items-center gap-5 pt-1">
            <a
              href="#catalog"
              className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
            >
              Browse the store
            </a>
            {products.length > 0 && (
              <span className="text-sm text-muted">
                {/* "1 products · from $4.99" is what a catalogue of one used to
                    read. "from" is also wrong at that size — there is nothing to
                    be cheapest of. */}
                {products.length === 1
                  ? `One product · ${money(fromPrice)}`
                  : `${products.length} products · from ${money(fromPrice)}`}
              </span>
            )}
          </div>
        </div>

        {/* Featured panel — a distinct desktop-only visual anchor. */}
        {featured && (
          <aside
            className="rise flex flex-col justify-between overflow-hidden rounded-3xl border border-border bg-surface p-7 md:col-span-5 md:aspect-[4/5]"
            style={{
              animationDelay: "120ms",
              backgroundImage:
                "radial-gradient(90% 60% at 100% 0%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 60%)",
            }}
          >
            <div className="flex items-center justify-between">
              <span className="kicker text-muted">Featured</span>
              {featuredBadge && (
                <span className="kicker rounded-full border border-border px-2.5 py-1 text-navy">
                  {BADGE_LABEL[featuredBadge]}
                </span>
              )}
            </div>
            {featuredCover && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={featuredCover}
                alt=""
                decoding="async"
                className="mt-5 aspect-[16/10] w-full rounded-2xl border border-border object-cover"
              />
            )}
            <div className="flex flex-col gap-2 pt-6">
              <h2 className="text-2xl leading-tight">{featured.title}</h2>
              <p className="text-sm text-muted">{featured.tagline}</p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
              {featuredOwned ? (
                <span className="kicker text-plum">Owned</span>
              ) : (
                <span className="font-display text-3xl">
                  {money(featured.priceCents, featured.currency)}
                </span>
              )}
              <a
                href={featuredOwned ? (featuredHref ?? "/library") : `/p/${featured.slug}`}
                className="text-sm font-medium text-fg underline-offset-4 hover:underline"
              >
                {featuredOwned ? "Access now →" : "Get it →"}
              </a>
            </div>
          </aside>
        )}
      </section>

      {/* Catalog grid — multi-column on desktop, single on mobile.
          Skipped entirely when there is only one product: the featured panel
          above is already that product, and a "Catalog" heading over a single
          repeated card reads like a page that failed to load the rest. */}
      {products.length !== 1 && (
        <section id="catalog" className="flex flex-col gap-7">
          <div className="flex items-baseline justify-between border-b border-border pb-4">
            <h2 className="text-xl md:text-2xl">The Catalog</h2>
            <span className="kicker text-muted">All products</span>
          </div>
          {products.length === 0 ? (
            <p className="py-12 text-muted">No products published yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((p, i) => (
                <ProductCard key={p.slug} item={toCard(p, display.get(p.id) ?? null, coverFor(p), ownedIds.has(p.id), accessHrefs.get(p.id))} index={i} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Subscription offers, presented as products in their own right. These
          are the highest-value thing the store sells and were reachable only as
          a checkout bump — invisible to anyone not already buying something. */}
      {subscriptions.map((offer) => (
        <SubscriptionSection
          key={offer.id}
          offer={offer}
          owned={ownedOfferIds.has(offer.id)}
        />
      ))}
    </div>
  );
}

// A subscription told as a product: what it is, what you get, what it costs,
// and what happens next. Deliberately not a ProductCard — a card in a grid says
// "one of several things to browse", and this is the opposite of that.
function SubscriptionSection({ offer, owned }: { offer: Offer; owned: boolean }) {
  const trial = offer.trialDays ?? 0;
  return (
    <section id={`offer-${offer.key}`} className="flex flex-col gap-7">
      <div className="flex items-baseline justify-between border-b border-border pb-4">
        <h2 className="text-xl md:text-2xl">Keep going</h2>
        <span className="kicker text-muted">Membership</span>
      </div>

      <div className="grid grid-cols-1 gap-8 rounded-3xl border border-border bg-surface p-7 md:grid-cols-12 md:gap-10 md:p-10">
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
              <span className="font-display text-4xl">
                {money(offer.priceCents, offer.currency)}
              </span>
              {offer.interval && <span className="text-muted">/{offer.interval}</span>}
            </div>
            {/* Say the charge out loud. A trial that bills silently on day 8 is
                the single most complained-about pattern in subscriptions. */}
            <p className="text-sm text-muted">
              {trial > 0
                ? `Free for ${trial} days, then ${money(offer.priceCents, offer.currency)} each ${offer.interval}. Cancel any time before then and you pay nothing.`
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
            <Link
              href={`/checkout/offer?offer=${offer.id}`}
              className="w-fit rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
            >
              {offer.acceptLabel}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

import { ProductCard, type CatalogItem } from "@/components/product-card";
import { listPublishedProducts } from "@/lib/store";
import { ownedProductIdsForViewer, accessHrefForProduct } from "@/lib/library";
import { productDisplay, type ProductDisplay } from "@/lib/courses";
import { publicCoverUrl } from "@/lib/media";
import type { Product } from "@/lib/types";

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
  const ownedIds = await ownedProductIdsForViewer();
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
                {products.length} products · from ${(fromPrice / 100).toFixed(0)}
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
                  ${(featured.priceCents / 100).toFixed(0)}
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

      {/* Catalog grid — multi-column on desktop, single on mobile. */}
      <section id="catalog" className="flex flex-col gap-7">
        <div className="flex items-baseline justify-between border-b border-border pb-4">
          <h2 className="text-xl md:text-2xl">The Catalog</h2>
          <span className="kicker text-muted">01 — All products</span>
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

    </div>
  );
}

import { ProductCard, type CatalogItem } from "@/components/product-card";
import { Logo } from "@/components/logo";
import { listPublishedProducts } from "@/lib/store";
import type { Product } from "@/lib/types";

function toCard(p: Product): CatalogItem {
  return { slug: p.slug, title: p.title, tagline: p.tagline ?? "", type: p.type, priceCents: p.priceCents };
}

export default async function Home() {
  const products = await listPublishedProducts();
  const featured = products[0];
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
              <span className="kicker rounded-full border border-border px-2.5 py-1 text-navy">
                {featured.type}
              </span>
            </div>
            <div className="flex flex-col gap-2 pt-10">
              <h2 className="text-2xl leading-tight">{featured.title}</h2>
              <p className="text-sm text-muted">{featured.tagline}</p>
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
              <span className="font-display text-3xl">
                ${(featured.priceCents / 100).toFixed(0)}
              </span>
              <a
                href={`/p/${featured.slug}`}
                className="text-sm font-medium text-fg underline-offset-4 hover:underline"
              >
                Get it &rarr;
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
              <ProductCard key={p.slug} item={toCard(p)} index={i} />
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="flex flex-col gap-4 border-t border-border py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <Logo className="h-5 w-auto text-fg" />
        <span>Store, library, and Content Engine — one account.</span>
      </footer>
    </div>
  );
}

import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug } from "@/lib/store";
import { ownedProductIdsForViewer, accessHrefForProduct } from "@/lib/library";
import { productDisplay, type CourseType } from "@/lib/courses";
import { publicCoverUrl } from "@/lib/media";
import { money } from "@/lib/money";
import { hasPageSections, getPageSections } from "@/lib/pages";
import { SalesPage } from "@/components/page/sales-page";

const TYPE_LABEL: Record<CourseType, string> = {
  video: "Video",
  audio: "Audio",
  pdf: "Guide",
  text: "Reading",
};

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product || product.status !== "published") notFound();

  const owned = (await ownedProductIdsForViewer()).has(product.id);
  const accessHref = owned ? await accessHrefForProduct(product.id) : "/library";
  // Badge comes from the course this product grants.
  const display = (await productDisplay([product.id])).get(product.id) ?? null;
  const badgeType = display?.type ?? null;
  // The product's own image wins; otherwise it inherits its course's.
  const coverUrl = publicCoverUrl(product.coverPath ?? display?.coverPath ?? null);

  // A configured sales page replaces the short card layout. Falling back rather
  // than switching on a flag means turning it on is one action in admin, and a
  // product nobody has written a page for keeps working exactly as before.
  //
  // Shown to owners too. Gating it on "not owned" meant the person most likely
  // to be looking — whoever just wrote the page and owns a copy — was the one
  // who never saw it. Owning it changes the button, not the page.
  if (await hasPageSections("product", product.id)) {
    const rows = await getPageSections("product", product.id);
    return (
      // Full-bleed: the bands run edge to edge, which the padded store shell
      // would otherwise inset. -mx cancels the shell's own gutter.
      <div className="-mx-4 md:-mx-6">
        <SalesPage
          rows={rows}
          money={{ priceLabel: money(product.priceCents, product.currency), termsLabel: null }}
          cta={(label) => (
            <Link
              href={owned ? accessHref : `/checkout?product=${product.slug}`}
              className="inline-block w-fit rounded-full bg-primary px-7 py-3 font-display text-[0.95rem] font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
            >
              {owned ? "Open in your library" : label}
            </Link>
          )}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 md:gap-14">
      <Link href="/" className="kicker w-fit text-muted hover:text-fg">
        &larr; Store
      </Link>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-12">
        {/* Media / cover. The gradient remains as the fallback, so a product
            whose course has no cover looks exactly as it did before. */}
        <div
          className="rise relative aspect-[16/10] w-full overflow-hidden rounded-3xl border border-border md:col-span-7"
          style={{
            background:
              "linear-gradient(150deg, color-mix(in srgb, var(--primary) 14%, var(--surface)), var(--surface-2))",
          }}
        >
          {coverUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={coverUrl}
              alt=""
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </div>

        {/* Details */}
        <div className="rise flex flex-col gap-5 md:col-span-5" style={{ animationDelay: "100ms" }}>
          {badgeType && <span className="kicker text-primary">{TYPE_LABEL[badgeType]}</span>}
          <h1 className="text-3xl leading-tight md:text-4xl">{product.title}</h1>
          {product.tagline && <p className="text-lg text-muted">{product.tagline}</p>}

          {/* Price is only news to someone who hasn't bought it. */}
          {!owned && (
            <div className="mt-2 flex items-baseline gap-3">
              <span className="font-display text-3xl">
                {money(product.priceCents, product.currency)}
              </span>
              {product.compareAtCents && (
                <span className="text-muted line-through">
                  {money(product.compareAtCents, product.currency)}
                </span>
              )}
            </div>
          )}

          {/* Never ask someone to buy what they already own — send them to it. */}
          {owned ? (
            <div className="mt-2 flex flex-col gap-2">
              <Link
                href={accessHref}
                className="w-fit rounded-full bg-primary px-7 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
              >
                Access now &rarr;
              </Link>
              <span className="text-sm text-muted">You already own this.</span>
            </div>
          ) : (
            <Link
              href={`/checkout?product=${product.slug}`}
              className="mt-2 w-fit rounded-full bg-primary px-7 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
            >
              Get it
            </Link>
          )}
        </div>
      </div>

      {product.description && (
        <section className="flex max-w-2xl flex-col gap-3 border-t border-border pt-8">
          <h2 className="kicker text-muted">About</h2>
          <p className="whitespace-pre-line leading-relaxed text-fg/90">
            {product.description}
          </p>
        </section>
      )}
    </div>
  );
}

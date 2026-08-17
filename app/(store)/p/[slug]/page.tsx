import { COVER_ASPECT } from "@/lib/cover";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug, getOffer } from "@/lib/store";
import { ownedProductIdsForViewer, accessHrefForProduct } from "@/lib/library";
import { productDisplay } from "@/lib/courses";
import { publicCoverUrl } from "@/lib/media";
import { money } from "@/lib/money";
import { TrackView } from "@/components/track-view";
import { BuyLink } from "@/components/buy-link";
import { hasPageSections, getPageSections, getPageSettings } from "@/lib/pages";
import { offersForRows } from "@/lib/block-offers";
import { shownPrices } from "@/lib/offer-prices";
import { resolveGlobals } from "@/lib/templates-store";
import { SalesPage } from "@/components/page/sales-page";
import { pageMetadata, absoluteUrl } from "@/lib/page-metadata";
import { getSettingsOrDefaults } from "@/lib/settings";
import type { Metadata } from "next";

/**
 * This page's own title, description and share card.
 *
 * Falls all the way through to the store's defaults, so a product nobody has
 * filled anything in for previews exactly as it did before this existed. See
 * lib/page-metadata.ts.
 *
 * Never throws. Metadata is decoration; a settings row that cannot be read must
 * cost this page its share card, not its ability to render.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  try {
    const { slug } = await params;
    const product = await getProductBySlug(slug);
    if (!product || product.status !== "published") return {};
    const [page, store, display] = await Promise.all([
      getPageSettings("product", product.id),
      getSettingsOrDefaults(),
      productDisplay([product.id]),
    ]);
    return pageMetadata({
      page,
      fallback: {
        title: product.title,
        description: product.tagline,
        coverPath: product.coverPath ?? display.get(product.id)?.coverPath ?? null,
      },
      store,
      url: absoluteUrl(`/p/${product.slug}`),
    });
  } catch {
    return {};
  }
}

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
  // The attached course, for its cover. The type badge that used to come from
  // here is gone — see the details column.
  const display = (await productDisplay([product.id])).get(product.id) ?? null;
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
    const [rows, settings] = await Promise.all([
      getPageSections("product", product.id),
      getPageSettings("product", product.id),
    ]);
    // Whatever this page points at, in one query. A pointer whose design has
    // gone resolves to nothing and renders nothing, so the page is shorter
    // rather than broken.
    const globals = await resolveGlobals(rows);
    // A product has one price of its own, so a Ways to pay block here has to
    // name the offer it sells. Resolved once, server-side.
    const byOffer = await offersForRows(rows);
    // The offer this product is sold on, if it names one. A Ways to pay block
    // here then needs no offer of its own — the page already knows.
    const soldOn = product.offerId ? await getOffer(product.offerId) : null;
    const soldPrices =
      soldOn && soldOn.active ? shownPrices(soldOn.prices, soldOn.pagePriceIds ?? []) : [];
    return (
      // Full-bleed: the bands run edge to edge, which the padded store shell
      // would otherwise inset. -mx cancels the shell's own gutter.
      // Full-bleed. The store shell caps main at max-w-5xl, and a negative
      // margin only cancels its padding — so the coloured bands stopped at
      // 1024px and the page read as a card floating on the shell's background
      // rather than as a page. overflow-x-clip guards the scrollbar gap that
      // 100vw leaves behind.
      // -mt-6 cancels the shell's top padding. The shell gives every page a
      // gap under the header, which is right for a page that sits in a column
      // and wrong for one whose first band is a full-width colour: the padding
      // showed as a stripe of the shell's own background between the header and
      // the band, which reads as a rendering fault rather than as spacing.
      <div className="-mt-6 mx-[calc(50%-50vw)] w-screen overflow-x-clip">
        <TrackView
          event="ViewContent"
          stableKey={product.slug}
          params={{ content_ids: [product.slug], content_type: "product", content_name: product.title }}
        />
        <SalesPage
          rows={rows}
          settings={settings}
          globals={globals}
          money={{
            priceLabel: money(product.priceCents, product.currency),
            termsLabel: null,
            byOffer,
            // The named offer's prices, so a Ways to pay block left blank draws
            // them. Its button goes to the offer's checkout, which is the one
            // that can bill a subscription — the product's own checkout still
            // takes the one-time price above.
            ...(soldPrices.length > 0 && soldOn
              ? {
                  prices: soldPrices,
                  currency: soldOn.currency,
                  buyHref: `/checkout/offer?offer=${soldOn.id}`,
                }
              : {}),
          }}
          cta={(label) => (
            <BuyLink
              href={owned ? accessHref : `/checkout?product=${product.slug}`}
              valueCents={owned ? null : product.priceCents}
              currency={product.currency}
              contentId={product.slug}
              className="inline-block w-fit rounded-full bg-primary px-7 py-3 font-display text-[0.95rem] font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
            >
              {owned ? "Open in your library" : label}
            </BuyLink>
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
          className={`rise relative ${COVER_ASPECT} w-full overflow-hidden rounded-3xl border border-border md:col-span-7`}
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
            <BuyLink
              href={`/checkout?product=${product.slug}`}
              valueCents={product.priceCents}
              currency={product.currency}
              contentId={product.slug}
              className="mt-2 w-fit rounded-full bg-primary px-7 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
            >
              Get it
            </BuyLink>
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

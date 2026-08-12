import "server-only";
import { listPublishedProducts, listSubscriptionOffers } from "@/lib/store";
import { productDisplay } from "@/lib/courses";
import { publicCoverUrl } from "@/lib/media";
import { offerHref } from "@/lib/offer-link";
import type { StoreRender } from "@/components/page/storefront-blocks";
import type { Product } from "@/lib/types";
import type { CatalogItem } from "@/components/product-card";

/**
 * The catalogue and the memberships, as the BUILDER should draw them.
 *
 * Catalogue, Memberships and Featured render nothing without a `store` payload,
 * and the payload only ever came from the storefront — so those three blocks
 * drew nothing in the editor. You would drop one in, see an empty band, and
 * conclude it was broken. That is the editor lying about the page, which is the
 * one thing it may not do.
 *
 * Everybody owns nothing here, deliberately. The admin previewing the home page
 * is designing what a NEW visitor sees; showing them "Active — open your
 * library" because they happen to own the thing would hide the selling state
 * they are actually working on. The live page still resolves real ownership.
 */
export async function storefrontPreview(): Promise<StoreRender> {
  const [products, offers] = await Promise.all([listPublishedProducts(), listSubscriptionOffers()]);
  const display = await productDisplay(products.map((p) => p.id));

  const card = (p: Product): CatalogItem => ({
    slug: p.slug,
    title: p.title,
    tagline: p.tagline ?? "",
    type: display.get(p.id)?.type ?? null,
    coverUrl: publicCoverUrl(p.coverPath ?? display.get(p.id)?.coverPath ?? null),
    priceCents: p.priceCents,
    currency: p.currency,
    owned: false,
  });

  return {
    products: products.map(card),
    featured: products[0] ? card(products[0]) : null,
    memberships: await Promise.all(
      offers.map(async (offer) => ({ offer, href: await offerHref(offer), owned: false })),
    ),
  };
}

import "server-only";
import { listActiveOffers, listPublishedProducts, getStoreId } from "@/lib/store";
import { offerHref } from "@/lib/offer-link";
import { getPageSections } from "@/lib/pages";
import { buildSectionView } from "@/lib/page-sections";
import { blocksForSection } from "@/lib/section-to-blocks";
import { walkBlocks } from "@/lib/blocks";
import { publicCoverUrl } from "@/lib/media";
import { productDisplay } from "@/lib/courses";
import { productLine, offerLine, oneLine, type SellableLine, type Faq } from "@/lib/structured-data";

/**
 * What the store sells, as lines a machine can read.
 *
 * The same rows the storefront draws, resolved once here for the JSON-LD,
 * the sitemap's cousin llms.txt, and anything else that has to state a
 * price: one source, so none of them can disagree with the page.
 */
export async function storeLines(base: string): Promise<SellableLine[]> {
  const [products, offers] = await Promise.all([listPublishedProducts(), listActiveOffers()]);
  const display = await productDisplay(products.map((p) => p.id));
  const productLines = products.map((p) =>
    productLine(p, base, publicCoverUrl(p.coverPath ?? display.get(p.id)?.coverPath ?? null)),
  );
  // Only offers with a page of their own: a line whose link lands on a
  // payment form is a link a reader cannot learn anything from.
  const offerLines = (
    await Promise.all(offers.map(async (o) => ({ o, href: await offerHref(o) })))
  )
    .filter(({ href }) => href.startsWith("/o/"))
    .map(({ o, href }) => offerLine(o, base, href));
  return [...productLines, ...offerLines];
}

/** The questions the published home page answers, from its FAQ blocks. */
export async function storeFaqs(): Promise<Faq[]> {
  const rows = await getPageSections("store", await getStoreId());
  return faqsIn(rows);
}

export function faqsIn(rows: Parameters<typeof buildSectionView>[0][]): Faq[] {
  const out: Faq[] = [];
  for (const row of rows) {
    if (!row.enabled) continue;
    const view = buildSectionView(row);
    if (!view) continue;
    for (const b of walkBlocks(blocksForSection(view))) {
      if (b.type !== "faq") continue;
      for (const it of (Array.isArray(b.props.items) ? b.props.items : []) as Record<string, unknown>[]) {
        const q = oneLine(String(it.q ?? ""));
        const a = oneLine(String(it.a ?? ""));
        if (q && a) out.push({ q, a });
      }
    }
  }
  return out;
}

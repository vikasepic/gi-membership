import "server-only";
import { getOffer } from "@/lib/store";
import { normalizeBlocks, walkBlocks, type Block } from "@/lib/blocks";
import { livePrices, type OfferPrice } from "@/lib/offer-prices";

/**
 * The prices for every offer a page's blocks name.
 *
 * A Ways to pay block usually draws whatever the page is already selling — an
 * offer's own page knows its offer. A product page does not, and neither does
 * the home page, so the block can name one instead. That naming is what lets a
 * subscription be sold from a page that is not the subscription's own.
 *
 * Resolved here, on the server, in one pass: the renderer is handed a map and
 * never asks the database anything. Blocks are untrusted stored JSON, so an id
 * that no longer resolves simply drops out and the block says it has nothing to
 * show — the same thing it says before an offer is chosen.
 */
export type BlockOffer = { prices: OfferPrice[]; currency: string; buyHref: string };

export async function offersForBlocks(blocks: Block[]): Promise<Record<string, BlockOffer>> {
  const ids = new Set<string>();
  for (const b of walkBlocks(blocks)) {
    if (b.type !== "prices") continue;
    const id = typeof b.props.offerId === "string" ? b.props.offerId.trim() : "";
    if (id) ids.add(id);
  }
  if (ids.size === 0) return {};

  const out: Record<string, BlockOffer> = {};
  await Promise.all(
    [...ids].map(async (id) => {
      const offer = await getOffer(id);
      // Inactive is left out rather than drawn greyed: a page that shows a
      // withdrawn offer's prices is a page inviting a purchase that the
      // fulfilment side would refuse.
      if (!offer || !offer.active) return;
      const prices = livePrices(offer.prices);
      if (prices.length === 0) return;
      out[id] = {
        prices,
        currency: offer.currency,
        buyHref: `/checkout/offer?offer=${offer.id}`,
      };
    }),
  );
  return out;
}

/**
 * The same, from the rows a page is stored as.
 *
 * Pages hold sections; sections hold blocks in a JSON column. Reading them the
 * way resolveGlobals does, rather than teaching every page to unpack a row.
 */
export async function offersForRows(rows: { content: unknown }[]): Promise<Record<string, BlockOffer>> {
  const blocks = rows.flatMap((row) => {
    const content = row.content as { blocks?: unknown } | null;
    return Array.isArray(content?.blocks) ? normalizeBlocks(content.blocks) : [];
  });
  return offersForBlocks(blocks);
}

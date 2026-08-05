import "server-only";
import { getOffer } from "@/lib/store";
import { getProductById } from "@/lib/admin";
import { money } from "@/lib/money";
import type { OwnerType } from "@/lib/pages";

/**
 * The figure a page shows when its price card is left empty.
 *
 * One function, so the editor's check and the page's rendering cannot disagree
 * about what "the real price" is — a validator with its own idea of the price
 * would either block honest saves or wave through lying ones.
 */
export async function realPriceLabel(owner: OwnerType, ownerId: string): Promise<string | null> {
  if (owner === "offer") {
    const offer = await getOffer(ownerId);
    return offer ? money(offer.priceCents, offer.currency) : null;
  }
  const product = await getProductById(ownerId);
  return product ? money(product.priceCents, product.currency) : null;
}

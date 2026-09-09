import type { Product, Offer } from "@/lib/types";

/**
 * What is wired up, and what is quietly not.
 *
 * A product with no buy control renders perfectly, reads perfectly, and
 * converts nobody — the only evidence is a conversion rate of zero. An offer
 * attached to nothing is either a draft or a mistake. Neither is visible on a
 * list that shows a title and a price.
 */

export type ProductWiring = {
  /** Has a sales page with something on it. */
  hasPage: boolean;
  hasBump: boolean;
  hasUpsell: boolean;
  /** Published, and something about it means it cannot be bought or delivered. */
  needsWiring: boolean;
  /** Said in words, for the row. */
  label: string;
};

export function wiringOf(
  product: Pick<Product, "status" | "bumpOfferId" | "upsellOfferId">,
  opts: { hasPage: boolean; courses: number },
): ProductWiring {
  const parts: string[] = [];
  if (opts.hasPage) parts.push("Sales page");
  if (product.bumpOfferId) parts.push("Bump");
  if (product.upsellOfferId) parts.push("OTO");

  // A draft with no sales page is not a problem, it is a draft. Only something
  // on sale can be broken, which is the whole point of the distinction.
  const live = product.status === "published";
  const missing: string[] = [];
  if (live && !opts.hasPage) missing.push("no sales page");
  if (live && opts.courses === 0) missing.push("nothing to deliver");

  return {
    hasPage: opts.hasPage,
    hasBump: Boolean(product.bumpOfferId),
    hasUpsell: Boolean(product.upsellOfferId),
    needsWiring: missing.length > 0,
    label: missing.length > 0 ? missing.join(" · ") : parts.join(" · ") || "Nothing attached",
  };
}

export type OfferUse = { hostTitle: string; slot: "bump" | "second price" | "one-click upsell" };

/**
 * Where an offer is attached.
 *
 * The only shared records in the store: everything else belongs to one thing,
 * an offer is deliberately reused. Reuse without visibility is how a price
 * changes somewhere nobody was looking.
 *
 * A host is a product OR another offer. Offers gained bump and upsell slots of
 * their own, and this kept scanning products alone — so the Book Launch System,
 * sitting in Book Writer's bump slot, read "Not attached to anything" on the
 * one screen built to catch exactly that.
 */
export function usesOf(
  offer: Pick<Offer, "id">,
  products: Pick<Product, "title" | "bumpOfferId" | "bumpAltOfferId" | "upsellOfferId">[],
  offers: Pick<Offer, "id" | "name" | "bumpOfferId" | "upsellOfferId">[] = [],
): OfferUse[] {
  const out: OfferUse[] = [];
  for (const p of products) {
    if (p.bumpOfferId === offer.id) out.push({ hostTitle: p.title, slot: "bump" });
    if (p.bumpAltOfferId === offer.id) out.push({ hostTitle: p.title, slot: "second price" });
    if (p.upsellOfferId === offer.id) out.push({ hostTitle: p.title, slot: "one-click upsell" });
  }
  for (const o of offers) {
    // An offer cannot host itself; the database refuses it. Skipped anyway so a
    // row can never report that it is attached to itself.
    if (o.id === offer.id) continue;
    if (o.bumpOfferId === offer.id) out.push({ hostTitle: o.name, slot: "bump" });
    if (o.upsellOfferId === offer.id) out.push({ hostTitle: o.name, slot: "one-click upsell" });
  }
  return out;
}

/**
 * What a buyer is agreeing to, in words.
 *
 * "recurring / 7 / month" is three columns you have to assemble yourself.
 */
export function termsOf(
  offer: Pick<Offer, "billingType" | "interval" | "trialDays">,
): string {
  if (offer.billingType !== "recurring") return "One-time";
  const per = `per ${offer.interval ?? "month"}`;
  return offer.trialDays ? `${offer.trialDays} days free, then ${per}` : per;
}

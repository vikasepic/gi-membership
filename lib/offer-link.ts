import "server-only";
import { hasPageSections } from "@/lib/pages";
import type { Offer } from "@/lib/types";

/**
 * Where a button for an offer should send someone.
 *
 * Its sales page, when it has one. A button that drops a reader straight onto
 * a payment form has skipped the part that explains what they are buying —
 * they arrive at a price with no argument attached, and the page that would
 * have made the case never gets shown.
 *
 * Straight to the checkout only when there is no sales page to show, because
 * an offer nobody has written a page for still has to be buyable.
 */
export async function offerHref(offer: Pick<Offer, "id" | "key">): Promise<string> {
  return (await hasPageSections("offer", offer.id))
    ? `/o/${offer.key}`
    : `/checkout/offer?offer=${offer.id}`;
}

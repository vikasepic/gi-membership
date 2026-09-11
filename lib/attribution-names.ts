import "server-only";
import { stripeAttributionMetadata, type Attribution } from "@/lib/attribution";
import { metaNamesFor } from "@/lib/meta-names";
import { nameMetadata } from "@/lib/meta-id";

/**
 * The campaign metadata Stripe carries, plus readable names.
 *
 * `stripeAttributionMetadata` stays pure and untouched — it is the vocabulary
 * every side of this shares, and the other platform filters on exactly the keys
 * it emits. This wraps it for the one place that can reach a database: adding
 * `utm_campaign_name`, `utm_adset_name`, `utm_content_name` and
 * `utm_term_name` beside the raw ids, never instead of them.
 *
 * Only a value that IS an id and IS known produces a `_name` key, so a campaign
 * already sending a real name adds nothing here and costs nothing.
 *
 * Never throws: `metaNamesFor` swallows its own failures and returns what it
 * has, so the worst case is the metadata this always wrote. This runs while a
 * card is being charged — an ads-reporting nicety may not stand between a buyer
 * and their purchase.
 */
export async function stripeAttributionWithNames(
  a: Attribution | null | undefined,
): Promise<Record<string, string>> {
  const base = stripeAttributionMetadata(a);
  const last = a?.last ?? {};
  try {
    const names = await metaNamesFor(Object.values(last));
    return { ...base, ...nameMetadata(last, names) };
  } catch {
    return base;
  }
}

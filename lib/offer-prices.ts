import { money } from "@/lib/money";

/**
 * One way to buy a thing.
 *
 * Named for offers because they had it first; a product's ways to pay are
 * these, exactly — same columns, same rules, same helpers. Renaming the type
 * would touch forty files to say something this sentence says, so it says it
 * here instead.
 *
 *
 * An offer used to be one price, and a second price meant a second offer —
 * with its own copy, its own bump design, its own OTO page and its own CRM
 * tags, all of it duplicated so that "monthly or yearly" could be asked. This
 * is the answer to that: the offer is the thing, and these are the ways to pay
 * for it.
 *
 * No currency of its own, deliberately. It lives on the offer and every price
 * shares it — a radio group whose options are in different currencies is not a
 * feature, and the placement picker has always filtered by currency for that
 * reason.
 *
 * Nothing here touches Stripe. Subscriptions are created with inline
 * `price_data` and one-time offers are a bare PaymentIntent, so a price is
 * numbers the charge is built from rather than an object that has to exist
 * somewhere first.
 */
export type OfferPrice = {
  id: string;
  /** Optional. Blank means "say it in terms of what it costs". */
  label: string;
  billingType: "one_time" | "recurring";
  interval: "day" | "week" | "month" | "year" | null;
  intervalCount: number;
  trialDays: number | null;
  priceCents: number;
  compareAtCents: number | null;
  /** Hidden from new buyers. Never deleted while anybody is on it. */
  archived: boolean;
};

export const INTERVALS = ["day", "week", "month", "year"] as const;

/**
 * The prices of one offer, in the order the editor put them in.
 *
 * `sortOrder` is not on OfferPrice because nothing outside this needs it — the
 * order IS the array order everywhere else. It arrives on the row from the
 * database, so the sort happens once, here, at the point of hydration. Two
 * readers sorting differently is how the checkout ends up charging the option
 * beside the one that was ticked.
 */
export function sortPrices(
  rows: (Partial<OfferPrice> & { sortOrder?: number })[],
): OfferPrice[] {
  return [...rows]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map(({ sortOrder: _drop, ...price }) => ({
      ...newOfferPrice(price.id ?? ""),
      ...price,
      // `label` is NULLABLE in the database and NOT nullable here, which is a
      // difference the type system cannot see: a null arrives typed as string
      // and the first `.trim()` throws. Every offer backfilled by 0048 has one.
      // Coerced at the single point of hydration rather than defended at each
      // of the six places that read it.
      label: price.label ?? "",
    }));
}

/** A blank price to start from — one-time, so nothing is claimed by default. */
export function newOfferPrice(id: string): OfferPrice {
  return {
    id,
    label: "",
    billingType: "one_time",
    interval: null,
    intervalCount: 1,
    trialDays: null,
    priceCents: 0,
    compareAtCents: null,
    archived: false,
  };
}

/**
 * How often it bills, in words. "every 2 weeks", not "2 week".
 *
 * `intervalCount` is what makes fortnightly possible, and it is the reason
 * this cannot be `per ${interval}` the way `termsOf` gets away with.
 */
export function everyLabel(price: Pick<OfferPrice, "interval" | "intervalCount">): string {
  const unit = price.interval ?? "month";
  const n = Math.max(1, Math.round(price.intervalCount || 1));
  return n === 1 ? unit : `${n} ${unit}s`;
}

/**
 * What it costs, on its own terms. "$29/month", "$58/2 months", "$99".
 *
 * The headline figure, not the charge-today one: through a trial every option
 * is $0 today, and a choice between two $0s is not a choice anyone can make.
 */
export function priceLabel(price: OfferPrice, currency: string): string {
  const amount = money(price.priceCents, currency);
  if (price.billingType !== "recurring") return amount;
  return `${amount}/${everyLabel(price)}`;
}

/**
 * The small print: what happens today, and what happens after.
 *
 * Null for a one-time price, where the amount has already said everything.
 */
export function priceTerms(price: OfferPrice, currency: string): string | null {
  if (price.billingType !== "recurring") return null;
  const then = `then ${money(price.priceCents, currency)} every ${everyLabel(price)}`;
  if (price.trialDays && price.trialDays > 0) {
    return `${price.trialDays} days free, ${then}, cancel any time`;
  }
  return `${then}, cancel any time`;
}

/** What the card is charged the moment this is bought. */
export function chargeNowCents(price: OfferPrice): number {
  if (price.billingType === "one_time") return price.priceCents;
  if (price.trialDays && price.trialDays > 0) return 0;
  return price.priceCents;
}

/**
 * The one line the admin reads to know what a row does.
 *
 * Built from the numbers rather than typed, for the same reason the "Save 35%"
 * badge is: a sentence somebody wrote once outlives the next price change and
 * starts lying.
 */
export function priceSummary(price: OfferPrice, currency: string): string {
  const head = price.label.trim() ? `${price.label.trim()} — ` : "";
  const terms = priceTerms(price, currency);
  if (!terms) return `${head}${priceLabel(price, currency)}, one-time`;
  return `${head}${priceLabel(price, currency)}, ${terms}`;
}

/**
 * Which prices a placement shows.
 *
 * An empty selection means the first live one — which is exactly how an
 * unconfigured bump behaves today, a single tickbox at the offer's only price.
 * Order follows the offer's own order, not the order they were ticked in, so a
 * checkout cannot present them in an order the editor never saw.
 */
/**
 * Every price that is on offer.
 *
 * The difference from `shownPrices` is who decided. A PLACEMENT — a bump, an
 * upsell — is opt-in per product: ticking nothing there means the headline
 * price alone, so adding a third price to an offer cannot light up a third
 * radio on somebody else's checkout without them asking.
 *
 * A page selling the offer is the opposite. You put the block there to sell the
 * thing, so it sells all of it — and the way to show fewer is to hide one on
 * the offer, where it is visible, rather than through a selection with no
 * screen behind it. That hidden selection is what made the builder show two
 * prices and the live page show one.
 */
export function livePrices(prices: OfferPrice[] | null | undefined): OfferPrice[] {
  // Tolerates absent, because not every caller has one. A product built by a
  // fixture, or read through a path that predates product_prices, has no list
  // at all — and `undefined.filter` on the checkout is a page that 500s instead
  // of selling something.
  return (prices ?? []).filter((p) => !p.archived);
}

/**
 * The ways to pay a PAGE block shows.
 *
 * Not `shownPrices`, and the difference matters. A placement offers one thing
 * with an alternative, so an empty list there means "the headline price" — one
 * option. A page is a menu, so an empty list here means the whole menu.
 *
 * Getting these two the wrong way round is not theoretical: it already shipped
 * once, as a builder showing two prices above a live page showing one.
 */
export function chosenPrices(prices: OfferPrice[], chosenIds: unknown): OfferPrice[] {
  const live = livePrices(prices);
  const ids = Array.isArray(chosenIds) ? chosenIds.filter((x): x is string => typeof x === "string") : [];
  if (ids.length === 0) return live;
  const picked = live.filter((p) => ids.includes(p.id));
  // Every ticked price archived or deleted since. The menu beats an empty
  // block on the page that takes the money.
  return picked.length > 0 ? picked : live;
}

export function shownPrices(prices: OfferPrice[], chosenIds: string[]): OfferPrice[] {
  const live = prices.filter((p) => !p.archived);
  if (live.length === 0) return [];
  const picked = live.filter((p) => chosenIds.includes(p.id));
  return picked.length > 0 ? picked : [live[0]];
}

/**
 * Which price a click actually buys.
 *
 * The whole point, and the invariant this inherits from `offerForChoice`: the
 * page shows the prices and the form sends an INDEX, never an id. The server
 * rebuilds the same list from the placement and looks the index up in it, so
 * the only thing a tampered request can do is pick something it was already
 * shown.
 *
 * `"none"` is a real answer rather than the absence of one — with more than one
 * option the control is a radio group, and a radio cannot be unticked by
 * clicking it again, so declining has to be something you can select.
 */
export type PriceChoice = "none" | number;

export function priceForChoice(shown: OfferPrice[], choice: PriceChoice): OfferPrice | null {
  if (choice === "none") return null;
  if (!Number.isInteger(choice) || choice < 0 || choice >= shown.length) return null;
  const price = shown[choice];
  return price && !price.archived ? price : null;
}

/**
 * Whether the buyer still owes an answer.
 *
 * Only when there is a choice to make. One option has nothing to answer — an
 * unticked box IS "none" — and holding the pay button over a question nobody
 * was asked is how a checkout loses a sale it had already won.
 */
export function needsAnswer(optionCount: number, choice: PriceChoice | null): boolean {
  return optionCount > 1 && choice === null;
}

/**
 * What a longer term saves against a shorter one, in its own words.
 *
 * Derived, never typed. Generalised from the old month-versus-year rule so it
 * can compare any two recurring prices of the same offer — but it still
 * refuses rather than inventing: a comparison needs both to recur, the longer
 * one to genuinely cost less per day, and the saving to round to at least one
 * per cent.
 */
export function savingAgainst(base: OfferPrice, other: OfferPrice): string | null {
  if (base.billingType !== "recurring" || other.billingType !== "recurring") return null;
  const a = perDay(base);
  const b = perDay(other);
  if (a === null || b === null || b >= a) return null;
  const pct = Math.round(((a - b) / a) * 100);
  return pct >= 1 ? `save ${pct}%` : null;
}

/**
 * Days per interval — and a month is 365/12, not 30.
 *
 * Thirty makes a year of months 360 days, so twelve monthlies come out cheaper
 * per day than they are and every yearly price overstates what it saves. The
 * old month-versus-year rule got this right by comparing 12 × monthly against
 * the year; this keeps that arithmetic while working for weeks and fortnights
 * too. A store cannot advertise a saving larger than the one it gives.
 */
const DAYS: Record<string, number> = { day: 1, week: 7, month: 365 / 12, year: 365 };

function perDay(price: OfferPrice): number | null {
  const unit = DAYS[price.interval ?? ""] ?? null;
  if (unit === null) return null;
  const days = unit * Math.max(1, Math.round(price.intervalCount || 1));
  return price.priceCents / days;
}

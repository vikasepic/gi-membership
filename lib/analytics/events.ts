/**
 * The events this store reports, and what each platform calls them.
 *
 * One name per thing that happens, defined once. Platform names are a mapping
 * at the edge rather than something call sites have to know — a checkout that
 * had to remember Meta says "InitiateCheckout" and GA4 says "begin_checkout"
 * is a checkout that reports one and forgets the other.
 */

export const EVENTS = [
  "PageView",
  "ViewContent",
  /** A buy button pressed on a sales page — intent, before any form. */
  "AddToCart",
  "Lead",
  /**
   * An address typed into a checkout.
   *
   * NOT a Lead. A lead is somebody who asked to hear from you; this is
   * somebody halfway through paying, and reporting it as a lead taught the ad
   * platform to optimise for people who reach the email field rather than for
   * people who reach the end. Reported under its own name so the number means
   * what it says and can be used as the intent signal it actually is.
   */
  "CheckoutEmailEntered",
  "CompleteRegistration",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
  /** A trial started — $0 today, money later. NOT a purchase. */
  "StartTrial",
  /** A trial converted into a paying subscription, seven days later. */
  "Subscribe",
  "LessonStarted",
  "LessonCompleted",
  /**
   * The add-on decisions, reported as they are made.
   *
   * A bump and an upsell are the two places a buyer says yes or no to
   * something extra, and until now only the yes ever surfaced — inside the
   * eventual Purchase, folded into one total. So "how many people are offered
   * the yearly and take it" was unanswerable, and a bump that nobody ever
   * ticked looked exactly like a bump nobody was ever shown.
   *
   * The declines matter more than the accepts. An offer declined by 95% of
   * people is a fact about the offer; without the event the only evidence is
   * an absence, and an absence cannot be segmented.
   */
  "BumpSelected",
  "BumpDeclined",
  "UpsellSelected",
  "UpsellDeclined",
  /**
   * Money given back, and money taken back.
   *
   * A refund revoked access and told nobody. So the sale stayed in Meta and
   * GA4 as revenue for good — and on this store more than half the paid
   * orders have been refunded, which is a reported figure with no relationship
   * to the money in the bank. Worse than the number being wrong: the platforms
   * keep optimising towards whatever produced a sale that was handed straight
   * back.
   *
   * Two names rather than one, because they are two different facts about a
   * customer. A refund is usually the store's decision and often amicable; a
   * chargeback is the bank reversing a payment over the store's head, and it
   * is the one worth being able to build an exclusion audience from.
   */
  "Refund",
  "Chargeback",
] as const;

export type EventName = (typeof EVENTS)[number];

/**
 * GA4's names for the same things.
 *
 * A custom event named after Meta's vocabulary would sit in GA4 reports as a
 * stranger none of its built-in reports understand.
 */
export const GA4_NAME: Record<EventName, string> = {
  PageView: "page_view",
  ViewContent: "view_item",
  AddToCart: "add_to_cart",
  Lead: "generate_lead",
  // GA4 has no standard event for this and inventing a `generate_lead` here
  // would put it in the same report as a real one.
  CheckoutEmailEntered: "checkout_email_entered",
  CompleteRegistration: "sign_up",
  InitiateCheckout: "begin_checkout",
  AddPaymentInfo: "add_payment_info",
  Purchase: "purchase",
  // GA4 has no trial concept. Both are purchases there — one of $0 today and
  // one of the real amount — which is exactly how the revenue reads.
  StartTrial: "purchase",
  Subscribe: "purchase",
  LessonStarted: "tutorial_begin",
  LessonCompleted: "tutorial_complete",
  // GA4 has `add_to_cart` and `remove_from_cart` and they fit exactly: an
  // add-on taken IS added to the order, and one declined is refused. Using
  // them rather than custom names means GA4's own funnel reports understand
  // these without anybody building a report — and `item_name` on the event
  // carries which option was chosen.
  BumpSelected: "add_to_cart",
  BumpDeclined: "remove_from_cart",
  UpsellSelected: "add_to_cart",
  UpsellDeclined: "remove_from_cart",
  // GA4 has exactly this event and its reports subtract it from revenue on
  // their own, given the same transaction_id the purchase carried.
  Refund: "refund",
  Chargeback: "refund",
};

/**
 * Which events Meta should receive from BOTH the browser and the server.
 *
 * Meta deduplicates on event_id, so sending both sides raises match quality
 * with no double counting. GA4 does not deduplicate at all, which is why its
 * commerce events are sent from the server ONLY — the same purchase reported
 * from a page and from a webhook would be two purchases and a doubled revenue
 * figure nobody can reconcile afterwards.
 */
export const META_BOTH_SIDES: EventName[] = [
  "AddToCart",
  "Purchase",
  "StartTrial",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Lead",
  /**
   * An address typed into a checkout.
   *
   * NOT a Lead. A lead is somebody who asked to hear from you; this is
   * somebody halfway through paying, and reporting it as a lead taught the ad
   * platform to optimise for people who reach the email field rather than for
   * people who reach the end. Reported under its own name so the number means
   * what it says and can be used as the intent signal it actually is.
   */
  "CheckoutEmailEntered",
  "CompleteRegistration",
];

/** Events only the server can know about — no browser is present. */
export const SERVER_ONLY: EventName[] = [
  "Subscribe",
  // Both arrive as a Stripe webhook, days or months after anybody was looking
  // at a page.
  "Refund",
  "Chargeback",
];

/**
 * Events Meta has no standard name for.
 *
 * fbq('track', …) only accepts Meta's own vocabulary; anything else is dropped
 * with a console warning nobody reads, and the event simply never arrives.
 * These go through fbq('trackCustom', …) instead, which is what a custom event
 * has always needed.
 */
export const META_CUSTOM: EventName[] = [
  "LessonStarted",
  "LessonCompleted",
  // Meta has no standard name for it, which is the point — the standard name
  // it was borrowing said something untrue.
  "CheckoutEmailEntered",
  // Meta has AddToCart, but these are not it. AddToCart is already sent when a
  // buy button is pressed, and reporting a ticked bump under the same name
  // would inflate that number with people who never reached a checkout — and
  // then optimise delivery against it. Custom names keep both readable.
  "BumpSelected",
  "BumpDeclined",
  "UpsellSelected",
  "UpsellDeclined",
  // Meta has no standard event for money going back. fbq only accepts its own
  // vocabulary, so borrowing "Purchase" would ADD the refund to revenue — the
  // exact opposite of what it means.
  "Refund",
  "Chargeback",
];

/** Events with no money on them; sending a value would invent revenue. */
export const NO_VALUE: EventName[] = [
  "PageView",
  "ViewContent",
  "Lead",
  // Somebody typing an address has bought nothing. A value here would be
  // revenue that has not happened, on the event that happens most often.
  "CheckoutEmailEntered",
  /**
   * An address typed into a checkout.
   *
   * NOT a Lead. A lead is somebody who asked to hear from you; this is
   * somebody halfway through paying, and reporting it as a lead taught the ad
   * platform to optimise for people who reach the email field rather than for
   * people who reach the end. Reported under its own name so the number means
   * what it says and can be used as the intent signal it actually is.
   */
  "CheckoutEmailEntered",
  "CompleteRegistration",
  "LessonStarted",
  "LessonCompleted",
  // A decline moves no money. The value belongs on the accept, where there is
  // an amount that might actually be charged.
  "BumpDeclined",
  "UpsellDeclined",
];

/**
 * An id shared by the browser and server copies of one event.
 *
 * Deterministic where it can be — an order id produces the same event id on the
 * page and in the webhook without either telling the other, which is what makes
 * deduplication survive a redirect. Random only when there is nothing stable to
 * derive it from.
 */
/**
 * The same id, for a funnel's own event name.
 *
 * Deliberately the same shape as eventIdFor — `name.key` — because the browser
 * and the server each build it from the order without telling each other, and
 * Meta collapses the pair on it. A different formula on either side is two
 * sales.
 */
export function customEventIdFor(name: string, stableKey: string): string {
  return `${name}.${stableKey}`;
}

export function eventIdFor(name: EventName, stableKey?: string | null): string {
  if (stableKey) return `${name}.${stableKey}`;
  const g = globalThis.crypto;
  const rand = g && "randomUUID" in g ? g.randomUUID() : `${Date.now()}.${Math.random()}`;
  return `${name}.${rand}`;
}

/**
 * What Meta is told this thing is called.
 *
 * `content_name` is what an ads team reads in reporting and builds audiences
 * on, and it came from three different places depending on the event: an order
 * line's description, a product's title, an offer's name. Those are storefront
 * copy — written for buyers — and renaming one to suit a campaign renamed it
 * on the sales page too.
 *
 * So the product and the offer each carry an optional `content_name`, and every
 * site that reports one asks here. Blank keeps whatever that site sent before,
 * which is what makes the column safe to add under live campaigns.
 */
export function contentNameOr<T>(override: string | null | undefined, fallback: T): string | T {
  return override?.trim() || fallback;
}

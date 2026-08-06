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
  "Lead",
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
  Lead: "generate_lead",
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
  "Purchase",
  "StartTrial",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Lead",
  "CompleteRegistration",
];

/** Events only the server can know about — no browser is present. */
export const SERVER_ONLY: EventName[] = ["Subscribe"];

/** Events with no money on them; sending a value would invent revenue. */
export const NO_VALUE: EventName[] = [
  "PageView",
  "ViewContent",
  "Lead",
  "CompleteRegistration",
  "LessonStarted",
  "LessonCompleted",
];

/**
 * An id shared by the browser and server copies of one event.
 *
 * Deterministic where it can be — an order id produces the same event id on the
 * page and in the webhook without either telling the other, which is what makes
 * deduplication survive a redirect. Random only when there is nothing stable to
 * derive it from.
 */
export function eventIdFor(name: EventName, stableKey?: string | null): string {
  if (stableKey) return `${name}.${stableKey}`;
  const g = globalThis.crypto;
  const rand = g && "randomUUID" in g ? g.randomUUID() : `${Date.now()}.${Math.random()}`;
  return `${name}.${rand}`;
}

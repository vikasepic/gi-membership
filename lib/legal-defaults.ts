/**
 * The legal values the store falls back to when nothing has been saved.
 *
 * These live apart from `lib/legal.ts` for one reason: `lib/settings.ts` needs
 * them to build its defaults, and `lib/legal.ts` needs settings to resolve. Two
 * modules importing each other is a cycle; the constants sitting in a third,
 * with no imports of its own, is not.
 *
 * The two blanks are deliberate. A policy page renders a visible warning while
 * either is empty, so an unfinished policy can never quietly go live looking
 * authoritative — and filling them in is now a form, not a deploy.
 */
export const LEGAL_DEFAULTS = {
  /** Trading name shown to buyers. Overridden by the store's own name. */
  storeName: "Greater Inside",

  /**
   * The registered legal entity that takes the money. Stripe shows
   * "Infinite Creative" on the card form, so that is likely it, but a policy
   * must name the entity exactly as registered — which only the owner knows.
   */
  legalEntity: "Infinite Creative",

  /** Registered address. Required in EU/UK consumer terms. */
  address: "",

  /** Where customers reach a human. */
  contactEmail: "support@greaterinside.com",

  /** Where privacy and data requests go. May be the same as contactEmail. */
  privacyEmail: "privacy@greaterinside.com",

  /** Governing law and courts, e.g. "England and Wales". */
  governingLaw: "",

  /**
   * Refund window in days for digital goods. 14 matches the EU/UK statutory
   * right of withdrawal, which is the safe default for a store taking EU/UK
   * traffic. Raising it is free; lowering it below 14 for EU/UK consumers is
   * not generally enforceable, which is why the field will not accept less.
   */
  refundWindowDays: 14,

  /** Last substantive change to these policies. */
  lastUpdated: "30 July 2026",
} as const;

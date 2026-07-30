// Business details the policy pages quote back to the reader.
//
// These are LEGAL commitments, so they are not inferred from the code — every
// value below is a decision only the store owner can make. The three marked
// NEEDS REVIEW are placeholders: the pages render a visible warning while any of
// them is still unset, so an unfinished policy can never quietly go live looking
// authoritative.
//
// Everything NOT marked is factual and derived from what the store actually
// does; it was verified against the code, not assumed. If you change how the
// store handles data, change it here too.

export const LEGAL = {
  /** Trading name shown to buyers. */
  storeName: "Greater Inside",

  /**
   * NEEDS REVIEW — the registered legal entity that takes the money. Stripe
   * shows "Infinite Creative" on the card form, so that is likely it, but a
   * policy must name the entity exactly as registered.
   */
  legalEntity: "Infinite Creative",

  /** NEEDS REVIEW — registered address. Required in EU/UK consumer terms. */
  address: "",

  /** Where customers reach a human. */
  contactEmail: "support@greaterinside.com",

  /** Where privacy/data requests go. May be the same as contactEmail. */
  privacyEmail: "privacy@greaterinside.com",

  /**
   * NEEDS REVIEW — governing law and courts, e.g. "England and Wales".
   * Drives which consumer-protection regime the terms sit under.
   */
  governingLaw: "",

  /**
   * Refund window in days for digital goods. 14 matches the EU/UK statutory
   * right of withdrawal, which is the safe default for a store taking EU/UK
   * traffic. Raise it freely; lowering it below 14 for EU/UK consumers is not
   * generally enforceable.
   */
  refundWindowDays: 14,

  /** Last substantive change to these policies. */
  lastUpdated: "30 July 2026",
} as const;

/** Fields that must be filled before these pages are safe to rely on. */
export const LEGAL_PLACEHOLDERS: readonly string[] = [
  ...(LEGAL.address ? [] : ["registered address"]),
  ...(LEGAL.governingLaw ? [] : ["governing law"]),
];

export const LEGAL_INCOMPLETE = LEGAL_PLACEHOLDERS.length > 0;

/**
 * Third parties that receive personal data, and what each one actually gets.
 * Verified against the code — do not add a processor here without a real call
 * site, and do not remove one that still runs.
 */
export const PROCESSORS = [
  {
    name: "Stripe",
    purpose: "Takes payments and stores your card. We never see or store card numbers.",
    data: "Name, email, billing country, payment details, purchase history.",
  },
  {
    name: "Resend",
    purpose: "Sends transactional email — receipts, welcome messages, password and login links.",
    data: "Email address and the contents of that email.",
  },
  {
    name: "Meta (Facebook)",
    purpose:
      "Measures which ads lead to purchases. Only with your consent — declining stops this entirely.",
    data: "A one-way hash of your email, your IP address, browser user-agent, and any Meta click id in the link you arrived from.",
  },
  {
    name: "Google Analytics",
    purpose: "Measures which ads lead to purchases. Only with your consent.",
    data: "Order id, purchase value and currency. No name or email is sent.",
  },
] as const;

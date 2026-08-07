import "server-only";
import { getSettings, type Settings } from "@/lib/settings";
import { LEGAL_DEFAULTS } from "@/lib/legal-defaults";

/**
 * Business details the policy pages quote back to the reader.
 *
 * These are LEGAL commitments, so none of them is inferred from the code —
 * every value is a decision only the store owner can make. They used to be
 * constants in this file, which meant the registered address of the business
 * could only be changed by someone who could deploy. They are settings now, and
 * `lib/legal-defaults.ts` holds what is used until something is saved.
 *
 * `PROCESSORS` below stays in code on purpose. It is the opposite kind of fact:
 * not a decision but a description of what the software actually does, verified
 * against real call sites. Making it editable would let the privacy policy
 * disagree with the code — the one thing a privacy policy may never do.
 */

export type Legal = {
  storeName: string;
  legalEntity: string;
  address: string;
  contactEmail: string;
  privacyEmail: string;
  governingLaw: string;
  companyNumber: string;
  vatNumber: string;
  refundWindowDays: number;
  lastUpdated: string;
};

/** Resolve the legal block from settings already in hand. */
export function legalFrom(s: Settings): Legal {
  return {
    // The store's own name is the trading name; the constant is only a
    // fallback for a store row that has somehow lost it.
    storeName: s.name || LEGAL_DEFAULTS.storeName,
    legalEntity: s.legalEntity,
    address: s.address,
    contactEmail: s.contactEmail,
    privacyEmail: s.privacyEmail,
    governingLaw: s.governingLaw,
    companyNumber: s.companyNumber,
    vatNumber: s.vatNumber,
    refundWindowDays: s.refundWindowDays,
    lastUpdated: s.policiesUpdated,
  };
}

/** The legal block, read fresh. */
export async function getLegal(): Promise<Legal> {
  return legalFrom(await getSettings());
}

/**
 * Fields that must be filled before these pages are safe to rely on.
 *
 * Named rather than counted everywhere it surfaces: "2 legal fields" tells you
 * there is work, "registered address" tells you what the work is.
 */
export function legalPlaceholders(l: Legal): string[] {
  return [
    ...(l.address ? [] : ["registered address"]),
    ...(l.governingLaw ? [] : ["governing law"]),
  ];
}

/** The same question, from settings, without resolving twice. */
export function legalPlaceholdersFrom(s: Settings): string[] {
  return legalPlaceholders(legalFrom(s));
}

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

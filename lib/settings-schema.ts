import { z } from "zod";
import { LEGAL_DEFAULTS } from "@/lib/legal-defaults";
import { SITE_TYPOGRAPHY_SCHEMA } from "@/lib/site-typography";

/**
 * Everything that is true of the whole store.
 *
 * These values used to live in three places — a source file, an environment
 * variable, and nowhere — which meant changing the registered address of the
 * business was a code deploy, and changing the brand colour was a code deploy
 * that also needed someone who knew which CSS variable it was.
 *
 * Three rules hold this together:
 *
 *  1. **A save MERGES.** Groups save independently, so a write that replaced the
 *     whole blob would silently wipe every other group — save Legal, lose Brand.
 *     `saveSettings` reads, merges, writes.
 *  2. **A missing value falls back to the code default**, so this table can be
 *     empty and the store still renders exactly as it did before any of this
 *     existed. Nothing has to be filled in for the site to work.
 *  3. **No secret lives here.** Stripe keys, the service-role key, the webhook
 *     and cron secrets and ADMIN_EMAILS stay in the environment. A secret
 *     editable from a page a compromised admin session can reach has a shorter
 *     life than you think, and ADMIN_EMAILS in particular must stay somewhere a
 *     mistake in this UI can never lock everyone out of their own admin.
 */

/** A colour we are willing to write into a stylesheet. */
const hexColor = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex colour like #b4472b");

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "Must start with http:// or https://");

/**
 * The whole shape, with the value used when nothing has been saved.
 *
 * One schema rather than one per group: the form, the server action and every
 * reader then agree by construction, and a field cannot be added to the page
 * without also existing here.
 */
export const SETTINGS_SCHEMA = z.object({
  // ---- Identity ----------------------------------------------------------
  tagline: z.string().trim().max(160).default(""),

  // ---- Brand -------------------------------------------------------------
  primaryColor: hexColor.default("#b4472b"),
  deepColor: hexColor.default("#1f3a5f"),
  logoPath: z.string().trim().max(300).default(""),
  faviconPath: z.string().trim().max(300).default(""),
  // Empty means the font the app was built with. Stored as the family name,
  // validated against what is actually installed when the form saves — a name
  // with nothing behind it renders as the fallback and looks like a bug.
  headingFont: z.string().trim().max(60).default(""),
  bodyFont: z.string().trim().max(60).default(""),
  // One object rather than a field per element per width — eleven elements
  // times four measurements is a settings table nobody could read, and the
  // group's form posts it as one JSON string for the same reason the page
  // editor posts a section's blocks that way. Its schema never throws and
  // treats every missing key as "inherit", so an empty blob is the store
  // exactly as it renders today.
  siteTypography: SITE_TYPOGRAPHY_SCHEMA,

  // ---- Legal -------------------------------------------------------------
  legalEntity: z.string().trim().max(160).default(LEGAL_DEFAULTS.legalEntity),
  address: z.string().trim().max(400).default(LEGAL_DEFAULTS.address),
  governingLaw: z.string().trim().max(160).default(LEGAL_DEFAULTS.governingLaw),
  companyNumber: z.string().trim().max(80).default(""),
  vatNumber: z.string().trim().max(80).default(""),
  contactEmail: z.string().trim().max(160).default(LEGAL_DEFAULTS.contactEmail),
  privacyEmail: z.string().trim().max(160).default(LEGAL_DEFAULTS.privacyEmail),
  // Coerced because a form sends a string. Floor of 14: below that is not
  // generally enforceable against EU/UK consumers, so the field refuses to
  // state a promise the law would override.
  refundWindowDays: z.coerce
    .number()
    .int()
    .min(14, "14 days is the EU/UK statutory minimum")
    .max(365)
    .default(LEGAL_DEFAULTS.refundWindowDays),
  policiesUpdated: z.string().trim().max(60).default(LEGAL_DEFAULTS.lastUpdated),

  // ---- Commerce ----------------------------------------------------------
  currency: z.string().trim().toLowerCase().length(3, "Three-letter ISO code").default("usd"),
  /** Shown on the checkout. Blank means we promise nothing, which is honest. */
  replyTime: z.string().trim().max(80).default(""),

  // ---- SEO & social ------------------------------------------------------
  metaTitle: z.string().trim().max(70).default(""),
  metaDescription: z.string().trim().max(180).default(""),
  shareImagePath: z.string().trim().max(300).default(""),
  socialInstagram: optionalUrl.default(""),
  socialYoutube: optionalUrl.default(""),
  socialX: optionalUrl.default(""),
  socialLinkedin: optionalUrl.default(""),

  // ---- Advanced ----------------------------------------------------------
  customCss: z.string().max(20000).default(""),
  customJs: z.string().max(20000).default(""),
});

export type Settings = z.infer<typeof SETTINGS_SCHEMA> & { name: string };

/** Every default, with nothing saved. Parsing `{}` is the single source. */
export const SETTINGS_DEFAULTS = SETTINGS_SCHEMA.parse({});

/**
 * The groups, in the order the page shows them.
 *
 * Ordered by what it costs to leave each one alone: Legal is first because two
 * of its fields being blank puts a warning in front of buyers on a live page.
 */
export const SETTINGS_GROUPS = [
  { key: "legal", label: "Legal" },
  { key: "identity", label: "Identity" },
  { key: "brand", label: "Brand" },
  { key: "typography", label: "Typography" },
  { key: "commerce", label: "Commerce" },
  { key: "seo", label: "SEO & social" },
  { key: "advanced", label: "Advanced" },
] as const;

export type SettingsGroupKey = (typeof SETTINGS_GROUPS)[number]["key"];

/** Which group owns which field, so a save only ever touches its own group. */
export const GROUP_FIELDS: Record<SettingsGroupKey, readonly (keyof Settings)[]> = {
  legal: [
    "legalEntity",
    "address",
    "governingLaw",
    "companyNumber",
    "vatNumber",
    "privacyEmail",
    "refundWindowDays",
    "policiesUpdated",
  ],
  identity: ["name", "tagline"],
  brand: ["primaryColor", "deepColor", "logoPath", "faviconPath"],
  typography: ["headingFont", "bodyFont", "siteTypography"],
  commerce: ["currency", "contactEmail", "replyTime"],
  seo: [
    "metaTitle",
    "metaDescription",
    "shareImagePath",
    "socialInstagram",
    "socialYoutube",
    "socialX",
    "socialLinkedin",
  ],
  advanced: ["customCss", "customJs"],
};


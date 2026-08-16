import { z } from "zod";
import { pricesField } from "@/lib/prices-field";
import type { OfferPrice } from "@/lib/offer-prices";

// The library delivers courses and nothing else, so a published product with no
// course attached is something a buyer can pay for and never receive. Publishing
// one is refused; a draft may sit courseless while it's being built.
export function blocksPublish(status: "draft" | "published", courseIds: string[]): boolean {
  return status === "published" && courseIds.length === 0;
}

export const PUBLISH_WITHOUT_COURSE_ERROR =
  "Attach at least one course before publishing — the library delivers courses, so a published product with no course would take payment and deliver nothing.";

// Accept any Postgres uuid shape, not just RFC-4122 v1-8. zod's .uuid() enforces
// version/variant bits, which rejects deterministic seed ids like
// 00000000-…-0000000000b1 that Postgres stores fine.
const uuidish = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid id");

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/**
 * A list of ids posted as one JSON string.
 *
 * Never throws and never returns null. An unreadable value narrows to "no
 * prices ticked", which is the same as an untouched placement — the wrong way
 * to fail here would be refusing the whole product save because of a field
 * nobody typed into.
 */
const idList = z
  .preprocess((raw) => {
    if (Array.isArray(raw)) return raw;
    if (typeof raw !== "string" || raw.trim() === "") return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, z.array(z.string().trim().min(1)))
  .catch([]);

// What the admin product form submits, and nothing else.
//
// media_mode / media_path / cover_image_url / media_embed_url are deliberately
// ABSENT. The form has no inputs for them, and including them here was a real
// bug on two counts: an absent field is `undefined`, which `emptyToNull` leaves
// alone and `.nullable()` then rejects — so every save died with three
// unattributable "Invalid input" messages — and had a value ever come through
// empty, saving would have nulled the media_mode that uploadPaidAsset sets,
// silently breaking that product's paid asset. The uploader owns those columns.
export const productSchema = z.object({
  id: uuidish.optional().or(z.literal("").transform(() => undefined)),
  slug: z
    .string()
    .trim()
    .min(1, "Slug required")
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only"),
  title: z.string().trim().min(1, "Title required"),
  tagline: z.preprocess(emptyToNull, z.string().nullable().default(null)),
  description: z.preprocess(emptyToNull, z.string().nullable().default(null)),
  // The ways to buy, through the very same schema the offer form uses — so a
  // rule cannot be stricter on one and looser on the other.
  //
  // Optional, because a save that carries no list (a script, an import, an
  // older form) must still produce a product. Where it IS given it is the
  // truth, and the product's own price column becomes a mirror of it.
  prices: pricesField.optional(),
  status: z.enum(["draft", "published"]),
  bumpOfferId: z.preprocess(emptyToNull, uuidish.nullable().default(null)),
  upsellOfferId: z.preprocess(emptyToNull, uuidish.nullable().default(null)),
  // The second price at each placement. Optional, and dropped below when it
  // would be the same offer twice.
  offerId: z.preprocess(emptyToNull, uuidish.nullable().default(null)),
  bumpAltOfferId: z.preprocess(emptyToNull, uuidish.nullable().default(null)),
  upsellAltOfferId: z.preprocess(emptyToNull, uuidish.nullable().default(null)),
  // A list of ids, posted as JSON the way every list in this admin is. Never
  // null: the column is jsonb with a `jsonb_typeof = 'array'` CHECK behind it.
  bumpPriceIds: idList,
  upsellPriceIds: idList,
  // ActiveCampaign tag ids are numeric, but kept as a string: it is an opaque
  // identifier handed straight back to AC, never arithmetic. Digits only, so a
  // pasted tag NAME is rejected here rather than silently failing at purchase
  // time when nobody is watching.
  // Optional, and blank means "use what the checkout already says".
  checkoutNote: z.preprocess(
    (x) => (typeof x === "string" && x.trim() === "" ? null : x),
    z.string().trim().max(240).nullable().default(null),
  ),
  activecampaignAbandonedTagId: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d+$/, "Abandoned-cart tag ID must be the numeric id from ActiveCampaign")
      .nullable()
      .default(null),
  ),
  activecampaignTagId: z.preprocess(
    emptyToNull,
    z
      .string()
      .regex(/^\d+$/, "Tag ID must be the numeric id from ActiveCampaign")
      .nullable()
      .default(null),
  ),
});

export type ParsedProduct = {
  id?: string;
  slug: string;
  title: string;
  tagline: string | null;
  description: string | null;
  priceCents: number;
  compareAtCents: number | null;
  /** Every way to buy this. Absent where the form did not carry a list. */
  prices?: OfferPrice[];
  status: "draft" | "published";
  bumpOfferId: string | null;
  upsellOfferId: string | null;
  offerId: string | null;
  bumpAltOfferId: string | null;
  upsellAltOfferId: string | null;
  bumpPriceIds: string[];
  upsellPriceIds: string[];
  activecampaignTagId: string | null;
  activecampaignAbandonedTagId: string | null;
  checkoutNote: string | null;
};

export type ParseResult =
  | { ok: true; data: ParsedProduct }
  | { ok: false; errors: Record<string, string> };

// Errors come back keyed by field so the form can show each one next to its own
// input instead of concatenating them into one opaque banner.
export function parseProductForm(raw: Record<string, unknown>): ParseResult {
  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      errors[key] ??= issue.message; // first message per field
    }
    return { ok: false, errors };
  }
  const v = parsed.data;
  return {
    ok: true,
    data: {
      id: v.id,
      slug: v.slug,
      title: v.title,
      tagline: v.tagline,
      description: v.description,
      // The headline, taken from the list rather than typed twice. It is a
      // mirror the database keeps; this only seeds a brand-new row, which is
      // NOT NULL and has no price rows to copy from yet.
      priceCents: v.prices?.[0]?.priceCents ?? 0,
      compareAtCents: v.prices?.[0]?.compareAtCents ?? null,
      prices: v.prices,
      status: v.status,
      bumpOfferId: v.bumpOfferId,
      upsellOfferId: v.upsellOfferId,
      // A second price with no first price is nothing, and a second price that
      // IS the first would render the same figure twice — the database refuses
      // it, so it is dropped here rather than failing the save.
      offerId: v.offerId,
      bumpAltOfferId: altFor(v.bumpOfferId, v.bumpAltOfferId),
      upsellAltOfferId: altFor(v.upsellOfferId, v.upsellAltOfferId),
      // Dropped with the offer, like the alt above: a list of prices belonging
      // to an offer this placement no longer names is a list nothing can
      // resolve, and it would sit there looking configured.
      bumpPriceIds: v.bumpOfferId ? v.bumpPriceIds : [],
      upsellPriceIds: v.upsellOfferId ? v.upsellPriceIds : [],
      activecampaignTagId: v.activecampaignTagId,
      activecampaignAbandonedTagId: v.activecampaignAbandonedTagId,
      checkoutNote: v.checkoutNote,
    },
  };
}

/** The second price a placement actually keeps. */
export function altFor(offerId: string | null, altId: string | null): string | null {
  if (!offerId || !altId || altId === offerId) return null;
  return altId;
}

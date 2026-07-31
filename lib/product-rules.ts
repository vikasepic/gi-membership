import { z } from "zod";

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
  // dollars from the form -> cents
  price: z.coerce.number().min(0, "Price must be 0 or more"),
  compareAt: z.preprocess(emptyToNull, z.coerce.number().min(0, "Must be 0 or more").nullable().default(null)),
  status: z.enum(["draft", "published"]),
  bumpOfferId: z.preprocess(emptyToNull, uuidish.nullable().default(null)),
  upsellOfferId: z.preprocess(emptyToNull, uuidish.nullable().default(null)),
  // ActiveCampaign tag ids are numeric, but kept as a string: it is an opaque
  // identifier handed straight back to AC, never arithmetic. Digits only, so a
  // pasted tag NAME is rejected here rather than silently failing at purchase
  // time when nobody is watching.
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
  status: "draft" | "published";
  bumpOfferId: string | null;
  upsellOfferId: string | null;
  activecampaignTagId: string | null;
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
      // Round after scaling: 19.99 * 100 is 1998.9999… in binary floating point.
      priceCents: Math.round(v.price * 100),
      compareAtCents: v.compareAt == null ? null : Math.round(v.compareAt * 100),
      status: v.status,
      bumpOfferId: v.bumpOfferId,
      upsellOfferId: v.upsellOfferId,
      activecampaignTagId: v.activecampaignTagId,
    },
  };
}

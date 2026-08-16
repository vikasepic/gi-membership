"use server";

import { z } from "zod";
import { pricesField } from "@/lib/prices-field";
import { parseOtoSections } from "@/lib/oto-sections";
import { OTO_TEMPLATES } from "@/lib/oto-template";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createOffer, updateOffer, deleteOffer, type OfferInput } from "@/lib/admin";
import { requireAdmin } from "@/lib/admin-guard";
import { altOfferIdFor } from "@/lib/offers";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const uuidish = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid id");

const schema = z
  .object({
    id: uuidish.optional().or(z.literal("").transform(() => undefined)),
    key: z.string().trim().min(1, "Key required").regex(/^[a-z0-9-]+$/, "lowercase, numbers, hyphens only"),
    name: z.string().trim().min(1, "Name required"),
    grantType: z.enum(["product", "subscription"]),
    grantProductId: z.preprocess(emptyToNull, uuidish.nullable()),
    grantAppId: z.preprocess(emptyToNull, uuidish.nullable()),
    grantEntitlementKey: z.preprocess(emptyToNull, z.string().nullable()),
    // The ways to pay, posted as one JSON string the way every other list in
    // this admin is. Every rule here is a rule the database also states as a
    // CHECK — a save that gets past this and fails there arrives as a bare
    // Postgres message about a constraint nobody can find.
    prices: pricesField,
    currency: z.string().trim().min(1).default("usd"),
    headline: z.string().trim().min(1, "Headline required"),
    description: z.preprocess(emptyToNull, z.string().nullable()),
    bullets: z.string().default(""),
    imageUrl: z.preprocess(emptyToNull, z.string().url("Must be a URL").nullable()),
    acceptLabel: z.string().trim().min(1).default("Yes, add this"),
    // Digits only, so a pasted tag NAME fails here rather than silently never
    // matching at purchase time.
    // The second price on this offer's own page. Empty means one price.
    pageAltOfferId: z.string().trim().optional().default(""),
    activecampaignTagId: z
      .string()
      .trim()
      .regex(/^\d*$/, "Tag ID must be the numeric id from ActiveCampaign")
      .optional()
      .default(""),
    // The lifecycle three. Same rule: a pasted tag NAME has to fail here, not
    // silently never match on the day someone's trial converts.
    activecampaignTrialTagId: z
      .string()
      .trim()
      .regex(/^\d*$/, "Trial tag ID must be the numeric id from ActiveCampaign")
      .optional()
      .default(""),
    activecampaignCancelledTagId: z
      .string()
      .trim()
      .regex(/^\d*$/, "Cancelled tag ID must be the numeric id from ActiveCampaign")
      .optional()
      .default(""),
    // Derived from OTO_TEMPLATES rather than repeated. Listing the layouts
    // here by hand is what broke saving: `sales` was added to the database
    // constraint, the registry and the dropdown, and this copy was missed, so
    // choosing it failed validation with Zod's bare "Invalid input".
    otoTemplate: z
      .enum([...OTO_TEMPLATES, "custom"] as [string, ...string[]])
      .default("visual"),
    otoBody: z.string().optional().default(""),
    otoVideoUrl: z.string().optional().default(""),
    otoProblem: z.string().optional().default(""),
    otoStats: z.string().optional().default(""),
    otoBenefits: z.string().optional().default(""),
    otoTestimonials: z.string().optional().default(""),
    otoComparison: z.string().optional().default(""),
    otoFaq: z.string().optional().default(""),
    declineLabel: z.string().trim().min(1).default("No thanks"),
    active: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  })
  .refine((v) => v.grantType !== "product" || v.grantProductId, {
    message: "Pick the product this offer grants",
    path: ["grantProductId"],
  })
  .refine((v) => v.grantType !== "subscription" || v.grantAppId, {
    message: "Pick the app this subscription grants",
    path: ["grantAppId"],
  });
// The recurring-needs-an-interval rule moved onto each price, where the
// billing type now lives — see the `prices` schema above.

export type SaveState = { error?: string; saved?: boolean };

export async function saveOffer(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    // Prefix each problem with the field it came from. A bare "Invalid input"
    // on a form this long tells the admin nothing about where to look.
    return {
      error: parsed.error.issues
        .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
        .join(", "),
    };
  }
  const v = parsed.data;
  const input: OfferInput = {
    key: v.key,
    name: v.name,
    grantType: v.grantType,
    grantProductId: v.grantProductId,
    grantAppId: v.grantAppId,
    grantEntitlementKey: v.grantEntitlementKey,
    prices: v.prices,
    currency: v.currency,
    headline: v.headline,
    description: v.description,
    bullets: v.bullets
      .split("\n")
      .map((b) => b.trim())
      .filter(Boolean),
    imageUrl: v.imageUrl,
    acceptLabel: v.acceptLabel,
    pageAltOfferId: altOfferIdFor(v.pageAltOfferId, v.id),
    activecampaignTagId: v.activecampaignTagId?.trim() || null,
    activecampaignTrialTagId: v.activecampaignTrialTagId?.trim() || null,
    activecampaignCancelledTagId: v.activecampaignCancelledTagId?.trim() || null,
    otoTemplate: v.otoTemplate,
    otoBody: v.otoBody,
    otoVideoUrl: v.otoVideoUrl,
    otoSections: parseOtoSections({
      problem: v.otoProblem,
      stats: v.otoStats,
      benefits: v.otoBenefits,
      testimonials: v.otoTestimonials,
      comparison: v.otoComparison,
      faq: v.otoFaq,
    }),
    declineLabel: v.declineLabel,
    active: v.active,
  };

  try {
    if (v.id) await updateOffer(v.id, input);
    else await createOffer(input);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Save failed" };
  }

  revalidatePath("/admin/offers");
  revalidatePath("/admin");

  // A new offer goes to the list; an edit stays where it is. Being thrown back
  // to the list after every save meant re-opening the offer to make the next
  // change, and losing which tab you were on.
  if (!v.id) redirect("/admin/offers");
  revalidatePath(`/admin/offers/${v.id}`);
  return { saved: true };
}

export async function removeOffer(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id");
  if (typeof id === "string" && id) {
    await deleteOffer(id);
    revalidatePath("/admin/offers");
    revalidatePath("/admin");
  }
  redirect("/admin/offers");
}

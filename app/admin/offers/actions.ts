"use server";

import { z } from "zod";
import { normalizeChannels } from "@/lib/app-channels";
import { appChannels } from "@/lib/apps";
import { pricesField } from "@/lib/prices-field";
import { parseOtoSections } from "@/lib/oto-sections";
import { OTO_TEMPLATES } from "@/lib/oto-template";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createOffer, updateOffer, updateOfferKey, deleteOffer, type OfferInput } from "@/lib/admin";
import { requireAdmin } from "@/lib/admin-guard";
import { altOfferIdFor } from "@/lib/offers";
import { OFFER_KEY, offerKeyProblem } from "@/lib/offer-key";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const uuidish = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid id");

const schema = z
  .object({
    id: uuidish.optional().or(z.literal("").transform(() => undefined)),
    // Same rule as the link editor on the page builder — see lib/offer-key.ts.
    // Two copies of this would be two definitions of what a public URL may
    // contain, and the looser one would win wherever it was used.
    key: z.string().trim().min(1, "Key required").regex(OFFER_KEY, "lowercase, numbers, hyphens only"),
    name: z.string().trim().min(1, "Name required"),
    grantType: z.enum(["product", "subscription"]),
    grantProductId: z.preprocess(emptyToNull, uuidish.nullable()),
    grantAppId: z.preprocess(emptyToNull, uuidish.nullable()),
    grantEntitlementKey: z.preprocess(emptyToNull, z.string().nullable()),
    // Only channels we know. A tickbox cannot send anything else, but this is
    // a form post — and the CHECK in 0058 would refuse an unknown value with a
    // database error rather than a message anybody can act on.
    grantChannels: z.preprocess(normalizeChannels, z.array(z.string())),
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
    // The ads team's own name for this offer's sale event. Bounded because
    // Meta drops a custom event name over 40 characters without saying so, and
    // from inside an ad account that is indistinguishable from broken tracking.
    adEventName: z
      .string()
      .trim()
      .max(40, "Meta ignores a custom event name longer than 40 characters")
      .optional()
      .default(""),
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
  // getAll for the channels, fromEntries for everything else.
  //
  // Object.fromEntries keeps only the LAST value of a repeated key, and a
  // checkbox list is the one control that posts its name more than once — so
  // ticking Instagram AND LinkedIn would have quietly saved LinkedIn alone,
  // and the offer would have granted half of what the admin ticked with
  // nothing anywhere saying so.
  const parsed = schema.safeParse({
    ...Object.fromEntries(formData),
    grantChannels: formData.getAll("grantChannels"),
  });
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

  // An offer may only sell what its app says it has.
  //
  // The tickboxes are already the app's own, but a form posts whatever it
  // posts — and a saved offer that grants an app "instagram" when the app has
  // no channels sends a field the app cannot read. Dropping rather than
  // refusing: the admin ticked nothing wrong, the list simply changed under an
  // open tab, and failing a whole save over it would be theatre.
  const declared = v.grantAppId ? await appChannels(v.grantAppId) : [];
  v.grantChannels = v.grantChannels.filter((c) => declared.includes(c));

  const input: OfferInput = {
    key: v.key,
    name: v.name,
    grantType: v.grantType,
    grantProductId: v.grantProductId,
    grantAppId: v.grantAppId,
    grantEntitlementKey: v.grantEntitlementKey,
    grantChannels: v.grantChannels,
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
    adEventName: v.adEventName?.trim() || null,
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

export type KeyState = { error?: string; saved?: string };

/**
 * Change an offer's public link, from the page builder.
 *
 * Separate from saveOffer because it is reached from a different screen with
 * one field on it. The offer's whole form is not on that page, so posting
 * through saveOffer would mean sending an offer's pricing and grants as hidden
 * inputs in order to rename a URL.
 *
 * Says plainly what it costs, because it cannot be undone by knowing the old
 * value: nothing redirects from the old address, so every link already
 * published — an ad, an email, a DM — is dead the moment this returns.
 */
export async function saveOfferKey(_prev: KeyState, formData: FormData): Promise<KeyState> {
  await requireAdmin();
  const id = formData.get("id");
  const raw = formData.get("key");
  if (typeof id !== "string" || !id) return { error: "Missing offer." };
  if (typeof raw !== "string") return { error: "Missing link." };

  const problem = offerKeyProblem(raw);
  if (problem) return { error: problem };
  const key = raw.trim();

  try {
    await updateOfferKey(id, key);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not change the link." };
  }

  revalidatePath(`/admin/offers/${id}`);
  revalidatePath(`/admin/offers/${id}/page-editor`);
  revalidatePath("/admin/offers");
  revalidatePath(`/o/${key}`);
  return { saved: key };
}

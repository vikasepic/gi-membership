"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createOffer, updateOffer, deleteOffer, type OfferInput } from "@/lib/admin";

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
    billingType: z.enum(["one_time", "recurring"]),
    interval: z.preprocess(emptyToNull, z.enum(["day", "week", "month", "year"]).nullable()),
    intervalCount: z.preprocess(emptyToNull, z.coerce.number().int().min(1).nullable()),
    trialDays: z.preprocess(emptyToNull, z.coerce.number().int().min(0).nullable()),
    price: z.coerce.number().min(0, "Price must be ≥ 0"),
    compareAt: z.preprocess(emptyToNull, z.coerce.number().min(0).nullable()),
    currency: z.string().trim().min(1).default("usd"),
    headline: z.string().trim().min(1, "Headline required"),
    description: z.preprocess(emptyToNull, z.string().nullable()),
    bullets: z.string().default(""),
    imageUrl: z.preprocess(emptyToNull, z.string().url("Must be a URL").nullable()),
    acceptLabel: z.string().trim().min(1).default("Yes, add this"),
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
  })
  .refine((v) => v.billingType !== "recurring" || v.interval, {
    message: "Recurring offers need a billing interval",
    path: ["interval"],
  });

export type SaveState = { error?: string };

export async function saveOffer(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  const v = parsed.data;
  const input: OfferInput = {
    key: v.key,
    name: v.name,
    grantType: v.grantType,
    grantProductId: v.grantProductId,
    grantAppId: v.grantAppId,
    grantEntitlementKey: v.grantEntitlementKey,
    billingType: v.billingType,
    interval: v.interval,
    intervalCount: v.intervalCount ?? (v.billingType === "recurring" ? 1 : null),
    trialDays: v.trialDays,
    priceCents: Math.round(v.price * 100),
    compareAtCents: v.compareAt == null ? null : Math.round(v.compareAt * 100),
    currency: v.currency,
    headline: v.headline,
    description: v.description,
    bullets: v.bullets
      .split("\n")
      .map((b) => b.trim())
      .filter(Boolean),
    imageUrl: v.imageUrl,
    acceptLabel: v.acceptLabel,
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
  redirect("/admin/offers");
}

export async function removeOffer(formData: FormData): Promise<void> {
  const id = formData.get("id");
  if (typeof id === "string" && id) {
    await deleteOffer(id);
    revalidatePath("/admin/offers");
    revalidatePath("/admin");
  }
  redirect("/admin/offers");
}

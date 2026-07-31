"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { updateStoreSettings } from "@/lib/admin";
import { requireAdmin } from "@/lib/admin-guard";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const schema = z.object({
  name: z.string().trim().min(1, "Store name required"),
  supportEmail: z.preprocess(emptyToNull, z.string().email("Must be an email").nullable()),
  currency: z.string().trim().min(1).default("usd"),
});

export type SaveState = { error?: string; saved?: boolean };

export async function saveSettings(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  }
  try {
    await updateStoreSettings(parsed.data);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Save failed" };
  }
  revalidatePath("/admin/settings");
  revalidatePath("/");
  return { saved: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { updateOfferPage } from "@/lib/admin";
import { normalizePageOverrides } from "@/lib/oto-content";

export type PageSaveState = { error?: string; saved?: boolean };

export async function saveOfferPageAction(
  _prev: PageSaveState,
  formData: FormData,
): Promise<PageSaveState> {
  await requireAdmin();
  const id = String(formData.get("offerId") ?? "");
  if (!id) return { error: "Missing offer." };

  const page = normalizePageOverrides((key) => {
    const raw = formData.get(key);
    return typeof raw === "string" ? raw : null;
  });

  try {
    await updateOfferPage(id, page);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save." };
  }

  revalidatePath(`/admin/offers/${id}/content`);
  revalidatePath("/checkout/oto");
  return { saved: true };
}

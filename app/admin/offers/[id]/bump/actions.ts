"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { updateOfferBump } from "@/lib/admin";
import { normalizeAccent } from "@/lib/bump";

export type BumpSaveState = { error?: string; saved?: boolean };

export async function saveBumpAction(
  _prev: BumpSaveState,
  formData: FormData,
): Promise<BumpSaveState> {
  await requireAdmin();
  const id = String(formData.get("offerId") ?? "");
  if (!id) return { error: "Missing offer." };

  const text = (key: string) => String(formData.get(key) ?? "").replace(/\r\n/g, "\n");

  try {
    await updateOfferBump(id, {
      // Empty string is meaningful here and must survive: it is how the editor
      // turns the banner off, as distinct from null meaning "never configured,
      // show the default". Trimming to null would make the banner reappear.
      bumpBanner: text("bumpBanner").trim(),
      bumpBullets: text("bumpBullets")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
      bumpNote: text("bumpNote").trim() || null,
      // Validated before it can reach a style attribute. An admin field is not
      // a reason to let arbitrary text into CSS.
      bumpAccent: normalizeAccent(text("bumpAccent")),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save." };
  }

  revalidatePath(`/admin/offers/${id}/bump`);
  revalidatePath("/checkout");
  return { saved: true };
}

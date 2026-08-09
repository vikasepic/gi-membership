"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { installGoogleFont, addCustomFontFile, removeFont } from "@/lib/fonts";

export type FontState = { error?: string; message?: string };

/**
 * Install a Google family.
 *
 * The files are downloaded here, once, and served from our own bucket from
 * then on — no visitor's browser ever contacts Google. Slow on purpose: this
 * is four or eight files, and doing it at install time is what buys every
 * page afterwards.
 */
export async function installGoogleFontAction(
  _prev: FontState,
  formData: FormData,
): Promise<FontState> {
  await requireAdmin();
  const family = String(formData.get("family") ?? "").trim();
  if (!family) return { error: "Choose a font" };
  try {
    const row = await installGoogleFont(family);
    revalidatePath("/admin/settings");
    revalidatePath("/", "layout");
    return { message: `${row.family} installed — ${row.files.length} files, served from this site.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not install that font" };
  }
}

export async function uploadFontAction(_prev: FontState, formData: FormData): Promise<FontState> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file" };
  try {
    const row = await addCustomFontFile({
      family: String(formData.get("family") ?? ""),
      weight: Number(formData.get("weight") ?? 400),
      style: String(formData.get("style") ?? "normal") === "italic" ? "italic" : "normal",
      file,
    });
    revalidatePath("/admin/settings");
    revalidatePath("/", "layout");
    return { message: `${row.family} now has ${row.files.length} file${row.files.length === 1 ? "" : "s"}.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not add that file" };
  }
}

export async function removeFontAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await removeFont(id);
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

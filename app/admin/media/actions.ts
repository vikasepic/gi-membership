"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { describeMedia } from "@/lib/media-library";
import { adoptStoredFiles } from "@/lib/media-adopt";

export type DescribeState = { ok?: boolean; error?: string };

export async function describeMediaAction(
  _prev: DescribeState,
  formData: FormData,
): Promise<DescribeState> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing file." };
  try {
    await describeMedia(id, {
      name: String(formData.get("name") ?? ""),
      alt: String(formData.get("alt") ?? ""),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save." };
  }
  revalidatePath("/admin/media");
  // The alt text is read by every page that shows this image.
  revalidatePath("/", "layout");
  return { ok: true };
}

export type AdoptState = { added?: number; error?: string };

/**
 * Take in everything uploaded before the library existed.
 *
 * Also the repair for a recorded-upload that failed: the row is written after
 * the file is already stored, deliberately without failing the upload if it
 * cannot be, so a file can exist in a bucket with nothing pointing at it.
 */
export async function adoptStoredFilesAction(): Promise<AdoptState> {
  await requireAdmin();
  try {
    const added = await adoptStoredFiles();
    revalidatePath("/admin/media");
    return { added };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not read storage." };
  }
}

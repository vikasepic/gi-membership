"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { offerKeyProblem } from "@/lib/offer-key";
import { duplicateProduct, duplicateOffer } from "@/lib/duplicate-write";

export type DuplicateState = { error?: string };

/**
 * Duplicate a product or an offer, from either editor.
 *
 * One action for both kinds because the shape of the job is identical — a
 * name for the copy, a rule to check it against, a writer to call — and the
 * only thing that differs is which writer and which editor it lands in.
 *
 * The slug/key is checked here with the same `offerKeyProblem` the box
 * validates against as the person types, so the field cannot say "fine" and
 * the server say otherwise. `duplicateProduct`/`duplicateOffer` check it
 * again against what is actually taken in the database — this check exists
 * so a plainly bad name (capitals, spaces, empty) is refused before either
 * writer opens a connection.
 *
 * Best-effort steps inside the writer (prices, page, page settings) can fail
 * without failing the whole copy — see lib/duplicate-write.ts. Those warnings
 * are not dropped: they ride along on the redirect as `warning` query
 * parameters, because the alternative — staying on this page instead of
 * landing in the new record's editor — trades away the thing this action is
 * for in order to show a message that a query string can carry just as well.
 */
export async function duplicateAction(_prev: DuplicateState, formData: FormData): Promise<DuplicateState> {
  await requireAdmin();

  const kind = formData.get("kind");
  const id = formData.get("id");
  const key = formData.get("key");

  if (kind !== "product" && kind !== "offer") return { error: "Missing kind." };
  if (typeof id !== "string" || !id) return { error: "Missing record." };
  if (typeof key !== "string") return { error: "Missing name." };

  const problem = offerKeyProblem(key);
  if (problem) return { error: problem };

  let result;
  try {
    result =
      kind === "product" ? await duplicateProduct(id, key) : await duplicateOffer(id, key);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not duplicate that." };
  }

  const listPath = kind === "product" ? "/admin/products" : "/admin/offers";
  revalidatePath(listPath);
  revalidatePath("/admin");

  const qs = new URLSearchParams();
  for (const w of result.warnings) qs.append("warning", w);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  redirect(`${listPath}/${result.id}${suffix}`);
}

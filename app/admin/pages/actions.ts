"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { savePageSettings, saveSection, seedPage, copyPage, StaleSectionError, type OwnerType } from "@/lib/pages";
import { sectionDef } from "@/lib/page-sections";
import { sanitizeSectionContent } from "@/lib/sanitize-html";
import { priceProblems, priceProblemMessage } from "@/lib/page-price-truth";
import { realPriceLabel } from "@/lib/page-money";

export type SectionSaveState = {
  error?: string;
  savedKey?: string;
  /** The stamp the write landed on, which is the baseline for the next save. */
  updatedAt?: string | null;
};

/**
 * The band's background, off the form.
 *
 * Empty means the preset alone. Anything that is not readable JSON is treated
 * the same way: a background nobody can parse is a background nobody asked for,
 * and refusing the whole save over it would lose the section's copy with it.
 */
function parseBackground(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as never) : null;
  } catch {
    return null;
  }
}

/**
 * Save one section of one page.
 *
 * The whole form posts, but only the named section is written — which is the
 * point. Two people editing different sections cannot overwrite each other.
 */
export async function saveSectionAction(
  _prev: SectionSaveState,
  formData: FormData,
): Promise<SectionSaveState> {
  await requireAdmin();

  const owner = String(formData.get("ownerType") ?? "") as OwnerType;
  const ownerId = String(formData.get("ownerId") ?? "");
  const sectionKey = String(formData.get("sectionKey") ?? "");
  if (owner !== "product" && owner !== "offer") return { error: "Bad owner." };
  if (!ownerId || !sectionDef(sectionKey)) return { error: "Unknown section." };

  let content: Record<string, unknown> = {};
  try {
    const raw = String(formData.get("content") ?? "{}");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) content = parsed;
  } catch {
    return { error: "Could not read the section's content." };
  }

  // A price card may state a figure the checkout will not charge, and once
  // stored nothing catches it — this store shipped a page saying $47 while the
  // offer took $29. Refused at the save, where the person who typed it is
  // still here to fix it.
  const problem = priceProblemMessage(
    priceProblems(content.blocks, sectionKey, await realPriceLabel(owner, ownerId)),
  );
  if (problem) return { error: problem };

  let updatedAt: string | null = null;
  try {
    updatedAt = await saveSection(owner, ownerId, sectionKey, {
      enabled: String(formData.get("enabled") ?? "true") === "true",
      style: String(formData.get("style") ?? ""),
      accent: String(formData.get("accent") ?? "").trim() || null,
      variant: String(formData.get("variant") ?? "").trim() || null,
      // Sanitize on the way in, so what is stored is always safe to render
      // regardless of what the editor or a paste produced.
      content: sanitizeSectionContent(content),
    // Empty means the band's preset alone.
    background: parseBackground(formData.get("background")),
    },
    // What the editor loaded. The write refuses to land on a row that has
    // moved since, so two people on one section cannot silently overwrite
    // each other — the second one is told.
    String(formData.get("baseUpdatedAt") ?? "") || null,
    );
  } catch (err) {
    if (err instanceof StaleSectionError) {
      return {
        error: `${err.message} Open it again to see their version — saving now would replace it.`,
      };
    }
    return { error: err instanceof Error ? err.message : "Could not save." };
  }

  revalidatePath(`/admin/${owner === "offer" ? "offers" : "products"}/${ownerId}/page`);
  revalidatePath("/p", "layout");
  revalidatePath("/checkout/oto");
  return { savedKey: sectionKey, updatedAt };
}

export async function enablePageAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const owner = String(formData.get("ownerType") ?? "") as OwnerType;
  const ownerId = String(formData.get("ownerId") ?? "");
  if ((owner !== "product" && owner !== "offer") || !ownerId) return;
  await seedPage(owner, ownerId);
  revalidatePath(`/admin/${owner === "offer" ? "offers" : "products"}/${ownerId}/page`);
}

export type ImageUploadState = { ok?: boolean; path?: string; error?: string };


export type PageSettingsState = { error?: string; saved?: boolean };

/**
 * Save a page's custom CSS and JS.
 *
 * Its own action rather than part of saveSectionAction: page-level code is not
 * a section, and folding it in would mean every section save rewriting the
 * script that runs on a page that takes payment.
 */
export async function savePageSettingsAction(
  _prev: PageSettingsState,
  formData: FormData,
): Promise<PageSettingsState> {
  await requireAdmin();

  const owner = String(formData.get("ownerType") ?? "") as OwnerType;
  const ownerId = String(formData.get("ownerId") ?? "");
  if (owner !== "product" && owner !== "offer") return { error: "Bad owner." };
  if (!ownerId) return { error: "Unknown page." };

  try {
    await savePageSettings(owner, ownerId, {
      customCss: String(formData.get("customCss") ?? ""),
      customJs: String(formData.get("customJs") ?? ""),
    });
    revalidatePath(`/admin/${owner === "product" ? "products" : "offers"}/${ownerId}/page-editor`);
    return { saved: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not save." };
  }
}

export type CopyPageState = { error?: string; message?: string };

/**
 * Use another page as a template.
 *
 * Replaces every section here with that page's. The prices and buy buttons
 * still belong to whatever owns THIS page — they are resolved at render — so a
 * copied page sells the thing it was copied onto, not the thing it came from.
 */
export async function copyPageAction(
  _prev: CopyPageState,
  formData: FormData,
): Promise<CopyPageState> {
  await requireAdmin();

  const owner = String(formData.get("ownerType") ?? "") as OwnerType;
  const ownerId = String(formData.get("ownerId") ?? "");
  const [fromType, fromId] = String(formData.get("from") ?? "").split(":");
  if (owner !== "product" && owner !== "offer") return { error: "Bad owner." };
  if ((fromType !== "product" && fromType !== "offer") || !fromId) {
    return { error: "Choose a page to copy from." };
  }

  try {
    const n = await copyPage({ ownerType: fromType, ownerId: fromId }, { ownerType: owner, ownerId });
    revalidatePath(`/admin/${owner === "offer" ? "offers" : "products"}/${ownerId}/page`);
    revalidatePath("/p", "layout");
    return { message: `${n} sections copied. Reload to edit them.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not copy that page." };
  }
}

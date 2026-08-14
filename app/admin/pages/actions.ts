"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { codeSnippetsSchema } from "@/lib/code-snippets";
import { getPageSettings, savePageSettings, saveSection, seedPage, seedHomeFromDefault, seedCheckoutFromDefault, copyPage, StaleSectionError, type OwnerType } from "@/lib/pages";
import { sectionDef } from "@/lib/page-sections";
import { sanitizeSectionContent } from "@/lib/sanitize-html";
import { priceProblems, priceProblemMessage } from "@/lib/page-price-truth";
import { realPriceLabel } from "@/lib/page-money";

/** Where this page is edited in the admin. */
const adminPathFor = (owner: OwnerType, ownerId: string) =>
  owner === "store"
    ? "/admin/home"
    : `/admin/${owner === "offer" ? "offers" : "products"}/${ownerId}/page`;

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
  return parseJsonObject(value);
}

/** A JSON object off the form, or nothing. Never a guess, never a throw. */
function parseJsonObject(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as never)
      : null;
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
  if (owner !== "product" && owner !== "offer" && owner !== "store") return { error: "Bad owner." };
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
    // The editor has been sending these since section attributes shipped and
    // saveSection has been writing them, but nothing read them off the form in
    // between — so a CSS id or class typed on a band was dropped on the way to
    // the database and came back empty on reload. Same parser as the
    // background: anything unreadable is nothing, never a guess.
    cssId: String(formData.get("cssId") ?? "").trim() || null,
    cssClass: String(formData.get("cssClass") ?? "").trim() || null,
    layout: parseJsonObject(formData.get("layout")),
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

  revalidatePath(adminPathFor(owner, ownerId));
  // The storefront IS a page, so saving one of its bands has to clear it. The
  // two lines below cover sales pages and the upsell and reach neither.
  if (owner === "store") revalidatePath("/", "layout");
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
  revalidatePath(adminPathFor(owner, ownerId));
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
  if (owner !== "product" && owner !== "offer" && owner !== "store") return { error: "Bad owner." };
  if (!ownerId) return { error: "Unknown page." };

  try {
    // Merged, never replaced.
    //
    // This row is now written by two panels — the SEO fields and the custom
    // code — and a full upsert from either one blanks whatever the other owns.
    // A field the form did not post is a field nobody was editing, so it keeps
    // what it had. The same rule the store-wide settings save follows, and for
    // the same reason: it was learnt by blanking something.
    const current = await getPageSettings(owner, ownerId);
    const text = (key: string, cap: number, fallback: string) =>
      formData.has(key) ? String(formData.get(key) ?? "").slice(0, cap) : fallback;

    await savePageSettings(owner, ownerId, {
      customCss: text("customCss", 100_000, current.customCss),
      customJs: text("customJs", 100_000, current.customJs),
      // Posted as JSON from a hidden input, the way every list on this admin
      // is. Unreadable means none rather than a save that throws.
      snippets: formData.has("snippets")
        ? (codeSnippetsSchema.safeParse(
            JSON.parse(String(formData.get("snippets") ?? "[]") || "[]"),
          ).data ?? [])
        : current.snippets,
      // Capped at what a search result and a share card actually show. A
      // 400-character description is not a longer description, it is one
      // truncated by Google rather than by whoever wrote it.
      metaTitle: text("metaTitle", 200, current.metaTitle),
      metaDescription: text("metaDescription", 400, current.metaDescription),
      shareImagePath: text("shareImagePath", 300, current.shareImagePath),
    });
    revalidatePath(`/admin/${owner === "product" ? "products" : "offers"}/${ownerId}/page-editor`);
    revalidatePath("/", "layout");
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
  if (owner !== "product" && owner !== "offer" && owner !== "store") return { error: "Bad owner." };
  if ((fromType !== "product" && fromType !== "offer") || !fromId) {
    return { error: "Choose a page to copy from." };
  }

  try {
    const n = await copyPage({ ownerType: fromType, ownerId: fromId }, { ownerType: owner, ownerId });
    revalidatePath(adminPathFor(owner, ownerId));
    revalidatePath("/p", "layout");
    return { message: `${n} sections copied. Reload to edit them.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not copy that page." };
  }
}


export type HomeSeedState = { ok?: boolean; message?: string; error?: string };

/**
 * Fill the storefront's bands with the page it is already showing.
 *
 * Never over the top of anything: a band with a block in it is left alone and
 * named in the reply, so pressing this twice, or after building one band by
 * hand, cannot cost anybody their work.
 */
export async function seedHomeAction(
  _prev: HomeSeedState,
  _formData: FormData,
): Promise<HomeSeedState> {
  await requireAdmin();
  try {
    const { written, skipped } = await seedHomeFromDefault();
    revalidatePath("/admin/home");
    revalidatePath("/", "layout");
    if (written.length === 0) {
      return {
        ok: true,
        message:
          skipped.length > 0
            ? "Every band already has something in it, so nothing was changed."
            : "There was nothing to add.",
      };
    }
    return {
      ok: true,
      message:
        skipped.length > 0
          ? `Filled ${written.length} ${written.length === 1 ? "band" : "bands"}. Left ${skipped.join(" and ")} alone — there was already something there.`
          : `Filled ${written.length} ${written.length === 1 ? "band" : "bands"} with the page the store is showing. Edit anything you like; the store follows this now.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not start from the current page." };
  }
}

export async function seedCheckoutAction(
  _prev: HomeSeedState,
  _formData: FormData,
): Promise<HomeSeedState> {
  await requireAdmin();
  try {
    const { written, skipped } = await seedCheckoutFromDefault();
    revalidatePath("/admin/checkout");
    // Every checkout, not one — this layout is the store's, not a product's.
    revalidatePath("/checkout", "layout");
    if (written.length === 0) {
      return {
        ok: true,
        message:
          skipped.length > 0
            ? "Every band already has something in it, so nothing was changed."
            : "There was nothing to add.",
      };
    }
    return {
      ok: true,
      message: `Filled ${written.length} ${written.length === 1 ? "band" : "bands"} with the checkout buyers are seeing. Move anything you like — the card fields, the total and the pay button can go anywhere, but not away.`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not start from the current checkout." };
  }
}

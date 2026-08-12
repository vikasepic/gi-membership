import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { sanitizeSectionContent } from "@/lib/sanitize-html";
import { camelize } from "@/lib/case";
import { normalizeHex } from "@/lib/color";
import { normalizeBackground, normalizeBlocks, type Background, type Block } from "@/lib/blocks";
import { priceProblems } from "@/lib/page-price-truth";
import { homeStarterBlocks } from "@/lib/home-starter";
import { codeSnippetsSchema, type CodeSnippet } from "@/lib/code-snippets";
import { realPriceLabel } from "@/lib/page-money";
import {
  HOME_SECTIONS,
  SECTIONS,
  BAND_STYLE_KEYS,
  sectionDef,
  defaultRows,
  layoutIsDefault,
  normalizeSectionLayout,
  type SectionLayout,
  type SectionRow,
} from "@/lib/page-sections";

/**
 * Whose page this is.
 *
 * "store" is the storefront's own home page. It has exactly one row in the
 * table, keyed by the store id, and it reads a different band list — see
 * HOME_SECTIONS. Everything else about it is a page like any other, which is
 * the point: one editor, one renderer, one save path.
 */
export type OwnerType = "product" | "offer" | "store";

/** The band list a page of this kind is made of. */
export const sectionsFor = (owner: OwnerType) => (owner === "store" ? HOME_SECTIONS : SECTIONS);

/**
 * The sections for one page, in order.
 *
 * A page that has never been edited returns the defaults rather than nothing,
 * so opening the editor shows a complete page to work from instead of ten empty
 * boxes — and so a page can be switched on before anyone has written a word.
 */
export async function getPageSections(owner: OwnerType, ownerId: string): Promise<SectionRow[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("page_sections")
    .select("section_key, position, enabled, style, accent, variant, content, background, css_id, css_class, layout, updated_at")
    .eq("owner_type", owner)
    .eq("owner_id", ownerId)
    .order("position");
  if (error) throw new Error(`getPageSections: ${error.message}`);

  // Sanitized on the way OUT as well as in.
  //
  // Saving already sanitizes, but that only covers rows written through the
  // editor. A row that arrives any other way — an older page from before a
  // field rendered its markup, a direct write, an import — would otherwise be
  // handed to the page exactly as stored. Headings and card titles render
  // their HTML now, so "exactly as stored" is the difference between a bold
  // word and a script tag on a live sales page. Verified by putting one there.
  const stored = new Map(
    camelize<SectionRow[]>(data ?? []).map((r) => [
      r.sectionKey,
      { ...r, content: sanitizeSectionContent((r.content ?? {}) as Record<string, unknown>) },
    ]),
  );
  // Merge onto the canonical list rather than returning what happens to be in
  // the table: a section added to the code later must appear on existing pages.
  return defaultRows(sectionsFor(owner)).map((d) => stored.get(d.sectionKey) ?? d);
}

/** True when anyone has configured this page at all. */
export async function hasPageSections(owner: OwnerType, ownerId: string): Promise<boolean> {
  const db = createServiceClient();
  const { count, error } = await db
    .from("page_sections")
    .select("id", { count: "exact", head: true })
    .eq("owner_type", owner)
    .eq("owner_id", ownerId);
  if (error) return false;
  return (count ?? 0) > 0;
}

export type SectionInput = {
  enabled: boolean;
  style: string;
  accent: string | null;
  variant: string | null;
  content: Record<string, unknown>;
  /**
   * A picture or a wash over the band's own colour. Null means the preset alone.
   *
   * The band still decides the ink, so the words stay readable when the image
   * is slow, fails, or turns out lighter than it looked in the picker.
   */
  background?: Background | null;
  /** A DOM id for this band, so a button can link to #it. */
  cssId?: string | null;
  cssClass?: string | null;
  /** How wide the band holds its content, and how much air. */
  layout?: SectionLayout | null;
};

/**
 * A CSS identifier, or nothing.
 *
 * This lands in an id attribute and in a selector, so anything that is not a
 * letter, a digit, a hyphen or an underscore is dropped rather than escaped —
 * the only safe answer to a quote or a bracket here is that there isn't one. A
 * leading digit is invalid in a selector, so it is prefixed rather than
 * silently producing an id nothing can target.
 */
export function cssIdent(value: string | null | undefined): string | null {
  const cleaned = String(value ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "");
  if (!cleaned) return null;
  return /^[0-9-]/.test(cleaned) ? `s-${cleaned}` : cleaned;
}

/** A class list: the same rule, applied to each name. */
export function cssClasses(value: string | null | undefined): string | null {
  const names = String(value ?? "")
    .split(/\s+/)
    .map((n) => cssIdent(n))
    .filter(Boolean);
  return names.length > 0 ? names.join(" ") : null;
}

/**
 * Save one section.
 *
 * Deliberately one row: this is what makes "save just this section" true rather
 * than a label on a button. Writing the whole page as a blob would let a save
 * of section 4 silently discard an edit to section 9 made a moment earlier.
 */
/** Thrown when the row moved under you. Carries who to blame and when. */
export class StaleSectionError extends Error {
  constructor(readonly savedAt: string) {
    super("This section was changed by someone else while you had it open.");
    this.name = "StaleSectionError";
  }
}

export async function saveSection(
  owner: OwnerType,
  ownerId: string,
  sectionKey: string,
  input: SectionInput,
  /**
   * The `updated_at` this editor loaded.
   *
   * Supplied, the write refuses to land on a row that has moved since — which
   * is the only thing that actually stops one person's work vanishing under
   * another's. Absent, the write is unconditional, so callers that have no
   * baseline to offer (seeding a page, a script) are unaffected.
   */
  baseUpdatedAt?: string | null,
): Promise<string | null> {
  const def = sectionDef(sectionKey);
  if (!def) throw new Error(`unknown section: ${sectionKey}`);

  // Ordered within its OWN list. `SECTION_KEYS.indexOf` answered -1 for every
  // storefront band, which would have stacked all four at the same position and
  // let the database decide the order of the home page.
  const list = sectionsFor(owner);
  const position = list.findIndex((d) => d.key === def.key);
  // And a band belongs to one kind of page. Without this, a product page could
  // be saved with a "Browse" band and the storefront with a "Guarantee" — rows
  // that no editor would ever show again and no renderer knows what to do with.
  if (position < 0) throw new Error(`section ${def.key} does not belong to a ${owner} page`);
  const style = BAND_STYLE_KEYS.includes(input.style as never) ? input.style : def.defaultStyle;
  const variant = def.variants?.some((v) => v.key === input.variant) ? input.variant : null;

  const db = createServiceClient();
  const row = {
      store_id: await getStoreId(),
      owner_type: owner,
      owner_id: ownerId,
      section_key: def.key,
      position,
      enabled: input.enabled,
      style,
      // Validated before it can reach a style attribute.
      accent: input.accent ? normalizeHex(input.accent, def.defaultStyle) : null,
      variant,
      content: input.content,
      // Normalised through the same reader a block's background uses — one
      // shape, one set of rules, one renderer.
      background:
        input.background && input.background.type !== "none"
          ? normalizeBackground(input.background)
          : null,
      css_id: cssIdent(input.cssId),
      css_class: cssClasses(input.cssClass),
      // Stored only once it says something. A band left at the built-in
      // measure keeps a null here, so "never touched" and "deliberately
      // boxed at 1040 with the standard air" stay distinguishable — and the
      // renderer can go on emitting the classes it always did.
      layout: (() => {
        const l = normalizeSectionLayout(input.layout);
        return layoutIsDefault(l) ? null : l;
      })(),
      updated_at: new Date().toISOString(),
  };

  if (baseUpdatedAt) {
    const landed = await updateIfUnchanged(owner, ownerId, def.key, baseUpdatedAt, row);
    if (landed) return landed;
    // Either the row moved under us, or there is no row yet. Only the first is
    // a conflict — a section saved for the first time has nothing to lose.
    const { data: current } = await db
      .from("page_sections")
      .select("updated_at")
      .eq("owner_type", owner)
      .eq("owner_id", ownerId)
      .eq("section_key", def.key)
      .maybeSingle();
    if (current) throw new StaleSectionError(current.updated_at as string);
  }

  // Read the stamp back rather than trusting the one we sent: a BEFORE UPDATE
  // trigger sets updated_at = now(), so the value that lands is the database's,
  // not ours. Returning ours would hand the editor a baseline that never
  // matches, and the next save would report a conflict with nobody.
  const { data, error } = await db
    .from("page_sections")
    .upsert(row, { onConflict: "owner_type,owner_id,section_key" })
    .select("updated_at")
    .maybeSingle();
  if (error) throw new Error(`saveSection: ${error.message}`);
  return (data?.updated_at as string) ?? null;
}

/**
 * Write, but only onto the row we read.
 *
 * The check and the write are one statement on purpose. Reading the row,
 * comparing in JavaScript and then writing leaves a window in which the other
 * person's save lands between the two and is overwritten anyway — the same bug,
 * made narrower rather than fixed. `eq("updated_at", …)` closes it: Postgres
 * matches zero rows if anything moved, and zero rows is the answer.
 *
 * Returns the new stamp when it landed, or null when it did not.
 */
async function updateIfUnchanged(
  owner: OwnerType,
  ownerId: string,
  sectionKey: string,
  baseUpdatedAt: string,
  row: Record<string, unknown>,
): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("page_sections")
    .update(row)
    .eq("owner_type", owner)
    .eq("owner_id", ownerId)
    .eq("section_key", sectionKey)
    .eq("updated_at", baseUpdatedAt)
    .select("updated_at");
  // The stamp the trigger wrote, which is the baseline for the next save.
  return (data ?? []).length > 0 ? ((data![0].updated_at as string) ?? null) : null;
}

/**
 * Write the full default page.
 *
 * Called once when someone turns a sales page on, so every section exists as a
 * real row and the editor's per-section saves have something to update.
 */
/**
 * Fill the storefront's bands with the built-in home page, as blocks.
 *
 * The fallback page is safe but it leaves the editor as four empty bands: a
 * blank canvas where a working page used to be, with no route from one to the
 * other except retyping it. This is that route.
 *
 * Refuses to run over work. Every band that already holds a block is left
 * exactly as it is, and the count comes back so the caller can say what
 * happened rather than claiming to have done something it did not.
 */
export async function seedHomeFromDefault(): Promise<{ written: string[]; skipped: string[] }> {
  const storeId = await getStoreId();
  const rows = await getPageSections("store", storeId);
  const starter = homeStarterBlocks();

  const written: string[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const blocks = starter[row.sectionKey];
    if (!blocks || blocks.length === 0) continue;
    const existing = (row.content as Record<string, unknown> | undefined)?.blocks;
    if (Array.isArray(existing) && existing.length > 0) {
      skipped.push(row.sectionKey);
      continue;
    }
    await saveSection("store", storeId, row.sectionKey, {
      enabled: true,
      style: row.style ?? sectionDef(row.sectionKey)?.defaultStyle ?? "cream",
      accent: row.accent ?? null,
      variant: row.variant ?? null,
      content: { ...(row.content ?? {}), blocks },
      background: (row.background as Background | null) ?? null,
      cssId: row.cssId ?? null,
      cssClass: row.cssClass ?? null,
    });
    written.push(row.sectionKey);
  }
  return { written, skipped };
}

export async function seedPage(owner: OwnerType, ownerId: string): Promise<void> {
  const db = createServiceClient();
  const storeId = await getStoreId();
  // The band list this kind of page is made of. Hardcoding SECTIONS here would
  // have seeded a storefront with Problem, Guarantee and Proof — rows no home
  // page renders and no editor offers.
  const rows = sectionsFor(owner).map((def, i) => ({
    store_id: storeId,
    owner_type: owner,
    owner_id: ownerId,
    section_key: def.key,
    position: i,
    enabled: true,
    style: def.defaultStyle,
    accent: null,
    variant: def.variants?.[0]?.key ?? null,
    content: {},
  }));
  const { error } = await db
    .from("page_sections")
    .upsert(rows, { onConflict: "owner_type,owner_id,section_key", ignoreDuplicates: true });
  if (error) throw new Error(`seedPage: ${error.message}`);
}

// --- page-level custom code -------------------------------------------------

export type PageSettings = { customCss: string; customJs: string; snippets: CodeSnippet[] };

export const NO_PAGE_SETTINGS: PageSettings = { customCss: "", customJs: "", snippets: [] };

export async function getPageSettings(owner: OwnerType, ownerId: string): Promise<PageSettings> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("page_settings")
    .select("custom_css, custom_js, snippets")
    .eq("owner_type", owner)
    .eq("owner_id", ownerId)
    .maybeSingle();
  // A page renders without its custom code; it does not render without the
  // page. So a failure here is empty custom code, not a 500 on a sales page.
  if (error || !data) return NO_PAGE_SETTINGS;
  const row = camelize<{ customCss: string; customJs: string; snippets: unknown }>(data);
  return {
    customCss: row.customCss ?? "",
    customJs: row.customJs ?? "",
    // Parsed, never cast. These rows predate the column, and a page whose
    // snippets are `null` must render rather than throw on `.filter`.
    snippets: codeSnippetsSchema.safeParse(row.snippets).data ?? [],
  };
}

export async function savePageSettings(
  owner: OwnerType,
  ownerId: string,
  input: PageSettings,
): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("page_settings").upsert(
    {
      store_id: await getStoreId(),
      owner_type: owner,
      owner_id: ownerId,
      custom_css: input.customCss,
      custom_js: input.customJs,
      snippets: codeSnippetsSchema.safeParse(input.snippets).data ?? [],
    },
    { onConflict: "owner_type,owner_id" },
  );
  if (error) throw new Error(`savePageSettings: ${error.message}`);
}

/** A page that exists and could be copied from. */
export type PageSource = {
  ownerType: OwnerType;
  ownerId: string;
  title: string;
  sections: number;
};

/**
 * Every page with something on it, for the "copy from" picker.
 *
 * Only pages with rows: a page nobody has written is a page with nothing to
 * copy, and offering it makes the list longer without making it more useful.
 */
export async function listPageSources(): Promise<PageSource[]> {
  const db = createServiceClient();
  const storeId = await getStoreId();

  const { data: rows } = await db
    .from("page_sections")
    .select("owner_type, owner_id")
    .eq("store_id", storeId);

  const counts = new Map<string, number>();
  for (const r of rows ?? []) {
    const key = `${r.owner_type}:${r.owner_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const ids = (t: string) =>
    [...counts.keys()].filter((k) => k.startsWith(`${t}:`)).map((k) => k.slice(t.length + 1));

  const [{ data: products }, { data: offers }] = await Promise.all([
    db.from("products").select("id, title").in("id", ids("product")),
    db.from("offers").select("id, name").in("id", ids("offer")),
  ]);

  const out: PageSource[] = [];
  for (const p of products ?? []) {
    out.push({
      ownerType: "product",
      ownerId: p.id as string,
      title: p.title as string,
      sections: counts.get(`product:${p.id}`) ?? 0,
    });
  }
  for (const o of offers ?? []) {
    out.push({
      ownerType: "offer",
      ownerId: o.id as string,
      title: o.name as string,
      sections: counts.get(`offer:${o.id}`) ?? 0,
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Typed price figures that would contradict the page they are landing on.
 *
 * A Price card left blank renders the owner's real figure, which is what makes
 * copying a page safe. A figure someone TYPED is content, and content is what
 * copyPage carries — so a $47 page copied onto a $29 product advertised $47
 * while the checkout charged $29. `saveSectionAction` refuses that on save;
 * this is the same rule on the other write path, except it cannot refuse
 * (the figure is right on the page it came from), so it clears the field back
 * to "use the real one".
 */
function retruthPrices(
  content: Record<string, unknown>,
  real: string | null,
): Record<string, unknown> {
  const bad = new Set(priceProblems(content.blocks, "", real).map((p) => p.blockId));
  if (bad.size === 0) return content;
  const clear = (blocks: Block[]): Block[] =>
    blocks.map((b) => ({
      ...b,
      props: bad.has(b.id) ? { ...b.props, price: "" } : b.props,
      ...(b.columns ? { columns: b.columns.map(clear) } : {}),
    }));
  return { ...content, blocks: clear(normalizeBlocks(content.blocks)) };
}

/**
 * Copy every section of one page onto another.
 *
 * Structure, copy, colours and backgrounds — everything the section rows hold.
 * What it deliberately does NOT carry across is the owner: prices, buy buttons
 * and the offer a page sells are resolved at render from whatever owns the
 * page, so a copied page sells the thing it was copied ONTO. That is the only
 * behaviour that makes "use this as a template" safe on a store taking money.
 *
 * Replaces the target's sections rather than merging. A half-copied page — some
 * bands from one design, some from another — is not a thing anybody asked for,
 * and telling which was which afterwards is impossible.
 */
export async function copyPage(
  from: { ownerType: OwnerType; ownerId: string },
  to: { ownerType: OwnerType; ownerId: string },
): Promise<number> {
  if (from.ownerType === to.ownerType && from.ownerId === to.ownerId) {
    throw new Error("That is the same page.");
  }
  // A sales page and the storefront are made of different bands, so there is no
  // row-for-row copy between them: every section would land on a key the other
  // page has never heard of. Said here rather than discovered as a constraint
  // violation halfway through the write.
  if ((from.ownerType === "store") !== (to.ownerType === "store")) {
    throw new Error("The home page and a sales page are built from different sections, so one cannot be copied onto the other.");
  }
  const db = createServiceClient();
  const storeId = await getStoreId();

  const { data: source, error } = await db
    .from("page_sections")
    .select("section_key, position, enabled, style, accent, variant, content, background, css_id, css_class, layout")
    .eq("owner_type", from.ownerType)
    .eq("owner_id", from.ownerId);
  if (error) throw new Error(`copyPage read: ${error.message}`);
  if (!source || source.length === 0) throw new Error("That page has nothing on it.");

  await db
    .from("page_sections")
    .delete()
    .eq("owner_type", to.ownerType)
    .eq("owner_id", to.ownerId);

  const real = await realPriceLabel(to.ownerType, to.ownerId);
  const { error: writeErr } = await db.from("page_sections").insert(
    source.map((r) => ({
      ...r,
      content: retruthPrices((r.content ?? {}) as Record<string, unknown>, real),
      store_id: storeId,
      owner_type: to.ownerType,
      owner_id: to.ownerId,
    })),
  );
  if (writeErr) throw new Error(`copyPage write: ${writeErr.message}`);
  return source.length;
}

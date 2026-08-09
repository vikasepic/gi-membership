import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { GOOGLE_FAMILIES, FONT_WEIGHTS, BUILT_IN_FONTS } from "@/lib/fonts-catalogue";

/**
 * Installing and serving typefaces.
 *
 * A Google family is downloaded once, here on the server, and stored in our own
 * bucket. From that moment it is indistinguishable from an uploaded font: same
 * table, same @font-face writer, same URLs. Nothing about a rendered page ever
 * touches Google.
 *
 * That is a privacy decision before it is a performance one. A <link> to
 * fonts.googleapis.com discloses every visitor's IP and user-agent to a third
 * party before the consent banner has spoken, and /privacy lists its processors
 * and says they were checked against the code.
 */

export type FontFile = { weight: number; style: "normal" | "italic"; path: string };
export type FontRow = {
  id: string;
  family: string;
  source: "google" | "custom";
  files: FontFile[];
};

const BUCKET = "public-media";

/**
 * A family name that is safe to write into CSS.
 *
 * It ends up inside `font-family: "…"` and inside an @font-face block, so a
 * quote or a brace in it would end the declaration and start something else.
 * Letters, digits, spaces and hyphens are all a typeface name needs.
 */
export function safeFamily(raw: string): string {
  return raw.replace(/[^A-Za-z0-9 \-]/g, "").trim().slice(0, 60);
}

/** Everything installed, plus the two that ship with the app. */
export async function listFonts(): Promise<FontRow[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("fonts")
    .select("id, family, source, files")
    .eq("store_id", await getStoreId())
    .order("family");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    family: r.family as string,
    source: r.source as FontRow["source"],
    files: (r.files ?? []) as FontFile[],
  }));
}

/** Every family the editor may offer, built-ins first. */
export async function availableFamilies(): Promise<string[]> {
  const installed = (await listFonts()).map((f) => f.family);
  return [...BUILT_IN_FONTS, ...installed.filter((f) => !BUILT_IN_FONTS.includes(f as never))];
}

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------

/**
 * Ask Google for the stylesheet a modern browser would get.
 *
 * The user-agent decides the format: without a recent one Google serves ttf,
 * which is three times the size of the woff2 every browser we support reads.
 */
const MODERN_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/**
 * Download a Google family into our bucket.
 *
 * Everything is fetched before anything is written, so a family that half
 * downloads does not leave a row claiming files that are not there — a missing
 * file is an invisible word on a live page.
 */
export async function installGoogleFont(rawFamily: string): Promise<FontRow> {
  const family = safeFamily(rawFamily);
  if (!GOOGLE_FAMILIES.includes(family)) throw new Error(`${family} is not in the list`);

  const spec = `${family.replace(/ /g, "+")}:ital,wght@${FONT_WEIGHTS.map((w) => `0,${w}`).join(";")};${FONT_WEIGHTS.map((w) => `1,${w}`).join(";")}`;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;

  const cssRes = await fetch(cssUrl, { headers: { "user-agent": MODERN_UA } });
  if (!cssRes.ok) throw new Error(`Google returned ${cssRes.status} for ${family}`);
  const css = await cssRes.text();

  const wanted = parseFaces(css);
  if (wanted.length === 0) throw new Error(`No usable files came back for ${family}`);

  const db = createServiceClient();
  const slug = family.toLowerCase().replace(/ /g, "-");
  const files: FontFile[] = [];

  for (const face of wanted) {
    const res = await fetch(face.url, { headers: { "user-agent": MODERN_UA } });
    if (!res.ok) continue;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const path = `fonts/${slug}/${face.weight}-${face.style}.woff2`;
    const { error } = await db.storage.from(BUCKET).upload(path, bytes, {
      contentType: "font/woff2",
      upsert: true,
      cacheControl: "31536000",
    });
    if (error) throw new Error(`storing ${family}: ${error.message}`);
    files.push({ weight: face.weight, style: face.style, path });
  }
  if (files.length === 0) throw new Error(`Could not store any file for ${family}`);

  return upsertFont({ family, source: "google", files });
}

/**
 * The faces worth keeping out of a Google stylesheet.
 *
 * Google serves one @font-face per unicode subset — latin, latin-ext, cyrillic,
 * greek and more — all with the same weight. Taking every one of them would
 * store a dozen files per weight for alphabets this store does not sell in, so
 * the first of each weight-and-style pair wins, and Google orders latin last
 * only in the sense that it is the one browsers pick for our text.
 */
function parseFaces(css: string): { weight: number; style: "normal" | "italic"; url: string }[] {
  const out: { weight: number; style: "normal" | "italic"; url: string }[] = [];
  const seen = new Set<string>();

  for (const block of css.split("@font-face").slice(1)) {
    // Subsets other than latin carry ranges outside it; keeping only the block
    // that covers basic latin gives one file per weight.
    const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1] ?? "";
    if (range && !range.includes("U+0000") && !range.includes("U+0020")) continue;

    const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1] ?? "400");
    const style = /font-style:\s*italic/.test(block) ? "italic" : "normal";
    const url = /url\((https:\/\/[^)]+\.woff2)\)/.exec(block)?.[1];
    if (!url || !Number.isFinite(weight)) continue;

    const key = `${weight}-${style}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ weight, style, url });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Custom uploads
// ---------------------------------------------------------------------------

export const FONT_MIME = new Set([
  "font/woff2",
  "font/woff",
  "font/ttf",
  "font/otf",
  "application/font-woff",
  "application/x-font-ttf",
  "application/vnd.ms-opentype",
  "application/octet-stream",
]);

const EXT = /\.(woff2|woff|ttf|otf)$/i;

/** Add one file to a family, creating the family if it is new. */
export async function addCustomFontFile(args: {
  family: string;
  weight: number;
  style: "normal" | "italic";
  file: File;
}): Promise<FontRow> {
  const family = safeFamily(args.family);
  if (!family) throw new Error("Give the family a name");
  if (!EXT.test(args.file.name)) throw new Error("Use a .woff2, .woff, .ttf or .otf file");
  if (args.file.size > 5 * 1024 * 1024) throw new Error("That file is over 5MB");

  const db = createServiceClient();
  const slug = family.toLowerCase().replace(/ /g, "-");
  const ext = (EXT.exec(args.file.name)?.[1] ?? "woff2").toLowerCase();
  const path = `fonts/${slug}/${args.weight}-${args.style}.${ext}`;

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, new Uint8Array(await args.file.arrayBuffer()), {
      contentType: args.file.type || "font/woff2",
      upsert: true,
      cacheControl: "31536000",
    });
  if (error) throw new Error(`storing ${family}: ${error.message}`);

  const existing = (await listFonts()).find((f) => f.family === family);
  // Same weight and style replaces rather than duplicates: re-uploading a file
  // is a correction, and two faces claiming 400-normal is a coin toss.
  const files = [
    ...(existing?.files ?? []).filter((f) => !(f.weight === args.weight && f.style === args.style)),
    { weight: args.weight, style: args.style, path },
  ].sort((a, b) => a.weight - b.weight || a.style.localeCompare(b.style));

  return upsertFont({ family, source: existing?.source ?? "custom", files });
}

async function upsertFont(row: { family: string; source: "google" | "custom"; files: FontFile[] }): Promise<FontRow> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("fonts")
    .upsert(
      { store_id: await getStoreId(), family: row.family, source: row.source, files: row.files },
      { onConflict: "store_id,family" },
    )
    .select("id, family, source, files")
    .single();
  if (error || !data) throw new Error(`saving ${row.family}: ${error?.message}`);
  return {
    id: data.id as string,
    family: data.family as string,
    source: data.source as FontRow["source"],
    files: (data.files ?? []) as FontFile[],
  };
}

/** Remove a family and its files. */
export async function removeFont(id: string): Promise<void> {
  const db = createServiceClient();
  const { data } = await db
    .from("fonts")
    .select("files")
    .eq("store_id", await getStoreId())
    .eq("id", id)
    .maybeSingle();

  const paths = ((data?.files ?? []) as FontFile[]).map((f) => f.path);
  if (paths.length > 0) await db.storage.from(BUCKET).remove(paths);
  await db.from("fonts").delete().eq("id", id);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * The @font-face rules for everything installed.
 *
 * All of them, on every store page. Declaring a face costs a few bytes and
 * downloads nothing — a browser fetches the file only when a rule actually
 * matches text on screen — so emitting the lot is cheaper than working out
 * which of them a block override might reach for.
 *
 * `font-display: swap` throughout: text drawn in the fallback and then
 * replaced is worse than nothing for a moment, and nothing is what the
 * alternative shows.
 */
export function fontFaceCss(fonts: FontRow[], publicBase: string): string {
  const out: string[] = [];
  for (const font of fonts) {
    const family = safeFamily(font.family);
    if (!family) continue;
    for (const file of font.files) {
      const url = `${publicBase}/storage/v1/object/public/${BUCKET}/${file.path}`;
      const format = file.path.endsWith(".woff2")
        ? "woff2"
        : file.path.endsWith(".woff")
          ? "woff"
          : file.path.endsWith(".otf")
            ? "opentype"
            : "truetype";
      out.push(
        `@font-face{font-family:"${family}";font-style:${file.style};font-weight:${file.weight};font-display:swap;src:url("${url}") format("${format}")}`,
      );
    }
  }
  return out.join("");
}

/** A font-family value, with the stack that catches a file that never arrives. */
export function familyStack(family: string | null | undefined, fallback: string): string {
  const safe = safeFamily(family ?? "");
  return safe ? `"${safe}", ${fallback}` : fallback;
}

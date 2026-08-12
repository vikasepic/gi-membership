import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  HOME_SECTIONS,
  HOME_SECTION_KEYS,
  SECTION_KEYS,
  defaultRows,
  sectionDef,
} from "@/lib/page-sections";
import { BLOCK_TYPES, STOREFRONT_TYPES, newBlock, normalizeBlocks } from "@/lib/blocks";
import { BLOCK_CONTROLS, controlsFor, paletteFor } from "@/lib/block-controls";

/**
 * The storefront is a page now, edited in the same builder as a sales page.
 *
 * The thing that must never happen is the two band lists mixing: a product page
 * saved with a "Browse" band, or a home page seeded with "Guarantee", is a row
 * no editor offers and no renderer draws.
 */
describe("the storefront's own bands", () => {
  it("shares no key with the sales page", () => {
    const overlap = HOME_SECTION_KEYS.filter((k) => (SECTION_KEYS as string[]).includes(k));
    expect(overlap).toEqual([]);
  });

  it("is what a store page defaults to, and the sales list is what everything else gets", () => {
    expect(defaultRows(HOME_SECTIONS).map((r) => r.sectionKey)).toEqual([...HOME_SECTION_KEYS]);
    expect(defaultRows().map((r) => r.sectionKey)).toEqual([...SECTION_KEYS]);
  });

  it("is findable by key, like every other section", () => {
    // `sectionDef` is asked about a key by the editor, the clipboard and the
    // save, none of which know which page it came from.
    for (const key of HOME_SECTION_KEYS) expect(sectionDef(key), key).toBeTruthy();
  });

  it("carries no typed fields", () => {
    // Sales sections have a form of named boxes because those pages were typed
    // before they were built. These are blocks from the first day.
    for (const def of HOME_SECTIONS) expect(def.fields, def.key).toEqual([]);
  });
});

describe("the blocks that draw live store data", () => {
  it("is offered on the home page and nowhere else", () => {
    const labels = (o: "product" | "offer" | "store") => paletteFor(o).map((p) => p.type);
    for (const t of STOREFRONT_TYPES) {
      expect(labels("store"), t).toContain(t);
      expect(labels("product"), t).not.toContain(t);
      expect(labels("offer"), t).not.toContain(t);
    }
  });

  it("is a real block in every other respect", () => {
    // Controls, defaults and a clean round trip through storage — the same bar
    // every other type meets, so none of the editor needs a special case.
    for (const t of STOREFRONT_TYPES) {
      expect(BLOCK_CONTROLS[t], t).toBeTruthy();
      const b = newBlock(t);
      expect(controlsFor(b).content.length, t).toBeGreaterThan(0);
      expect(normalizeBlocks(JSON.parse(JSON.stringify([b])))).toEqual([b]);
    }
  });

  it("is never dropped for being empty", () => {
    // Their content is the catalogue, which the block does not hold. Deciding
    // emptiness from the block would drop a Catalogue from a store that has no
    // products yet — and it would stay dropped after the first one shipped.
    const src = readFileSync("lib/blocks.ts", "utf8");
    const fn = src.slice(src.indexOf("export function blockRendersNothing"));
    for (const t of STOREFRONT_TYPES) expect(fn, t).toContain(`case "${t}":`);
  });

  it("counts as a block type everywhere types are counted", () => {
    for (const t of STOREFRONT_TYPES) expect(BLOCK_TYPES).toContain(t);
  });
});

/**
 * The storefront must survive this feature being switched off, because for
 * every store that has not built a home page it IS switched off.
 */
describe("the storefront falls back", () => {
  const src = readFileSync("app/(store)/page.tsx", "utf8");

  it("keeps the built-in page and only uses bands when something is in one", () => {
    expect(src).toContain("function DefaultHome");
    // Not "a row exists": opening the editor writes rows, and a page of empty
    // bands must not replace the storefront with a blank screen.
    expect(src).toContain("blocksForSection(view).length > 0");
  });

  it("draws the membership card from one implementation", () => {
    // The storefront and the Memberships block both draw it. Two copies would
    // drift, and the one that drifts is the one quoting a price.
    expect(src).toContain("MembershipCard");
    expect(src).not.toContain("function MembershipCard");
  });

  it("hands the canvas the same payload the page uses", () => {
    // Catalogue, Memberships and Featured render nothing without a `store`
    // payload, and only the storefront supplied one — so all three drew nothing
    // in the builder. You drop one in, see an empty band, and conclude it is
    // broken. The editor lying about the page is the one thing it may not do.
    const editor = readFileSync("app/admin/home/page.tsx", "utf8");
    expect(editor).toContain("storefrontPreview()");
    expect(editor).toContain("store={store}");

    // And it is the same StoreRender shape, not a second one invented for the
    // editor — two shapes drift, and the one that drifts quotes a price.
    const preview = readFileSync("lib/storefront-preview.ts", "utf8");
    expect(preview).toContain("Promise<StoreRender>");
  });

  it("previews as a visitor who owns nothing", () => {
    // The admin is designing what a NEW visitor sees. Showing them "Active —
    // open your library" because they happen to own the thing would hide the
    // selling state they are working on.
    const preview = readFileSync("lib/storefront-preview.ts", "utf8");
    expect(preview).toContain("owned: false");
    expect(preview).not.toContain("viewerOwnership");
  });
});

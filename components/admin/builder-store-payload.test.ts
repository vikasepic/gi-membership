import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * The storefront blocks need their payload on EVERY render path.
 *
 * Catalogue, Memberships and Featured draw nothing without `store`, and there
 * are three places that render them in the admin: the section preview under
 * each band, the builder's canvas, and the live page. Each is wired
 * separately, so one can be fixed while another stays broken — which is
 * exactly what happened twice. The section preview was fixed first and the
 * canvas kept drawing nothing; a band reported "1 block" beside a picture of
 * its content and opened onto an empty canvas.
 */
const editor = readFileSync("components/admin/page-editor.tsx", "utf8");
const field = editor.slice(editor.indexOf("function BlockCanvasField"));
const body = field.slice(0, field.indexOf("\n}\n"));

describe("the payload reaches every renderer", () => {
  it("the launcher takes it and hands it to the builder", () => {
    // Declaring it in the props type is not taking it: it was declared there
    // and never destructured, which type-checks and silently drops it.
    expect(body, "BlockCanvasField must destructure store").toMatch(/\n  store,\n/);
    expect(body, "and pass it to BlockEditor").toMatch(/<BlockEditor[\s\S]*?store=\{store\}/);
  });

  it("the section preview beside it takes it too", () => {
    expect(editor).toContain("<SectionBand row={{ ...row, content }} money={money} preview at={device} store={store} />");
  });

  it("the builder puts it on the canvas context the blocks read", () => {
    const be = readFileSync("components/admin/block-editor.tsx", "utf8");
    expect(be).toContain("<CanvasStore.Provider value={store}>");
  });

  it("the home editor is what supplies it", () => {
    const home = readFileSync("app/admin/home/page.tsx", "utf8");
    expect(home).toContain("storefrontPreview()");
    expect(home).toContain("store={store}");
  });
});

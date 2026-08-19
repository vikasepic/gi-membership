import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The offer's own picture, and the three places it was not shown.
 *
 * An offer has had an image_url column all along, edited through a text box
 * labelled "Image URL". An admin had to go and find an address, paste it, and
 * hope — nothing showed whether it resolved to anything. Two of the three
 * offers on this store have no image, which is what a field like that gets
 * you.
 *
 * And where the picture existed, almost nothing used it: the offers list drew
 * the granted PRODUCT's cover, so every app offer showed an empty square, and
 * the library drew a letter in a coloured box.
 */

const form = readFileSync("components/admin/offer-form.tsx", "utf8");
const field = readFileSync("components/admin/image-field.tsx", "utf8");
const settings = readFileSync("components/admin/settings-screen.tsx", "utf8");
const thumb = readFileSync("components/admin/catalogue-thumb.tsx", "utf8");
const list = readFileSync("app/admin/offers/page.tsx", "utf8");
const library = readFileSync("app/(store)/library/page.tsx", "utf8");
const libLib = readFileSync("lib/library.ts", "utf8");

describe("choosing it", () => {
  it("is a picker, not a URL to type", () => {
    expect(form).toContain("<ImageField");
    expect(form).not.toContain('<input name="imageUrl"');
  });

  it("shares one component with the settings screen", () => {
    // Settings had the only copy. Two pickers would drift, and the one that
    // drifts is always the one nobody is looking at.
    expect(field).toContain("export function ImageField");
    expect(settings).toContain('from "@/components/admin/image-field"');
    expect(settings).not.toContain("function ImageField({");
  });

  it("stores what each caller actually holds", () => {
    // Settings keeps a storage path; an offer keeps a whole address, because
    // image_url always has and a template pointing at somebody else's CDN
    // still needs to be able to.
    expect(field).toContain('stores?: "path" | "url"');
    expect(form).toContain('stores="url"');
    expect(field).toContain('stores === "url" ? (item.url ?? publicCoverUrl(item.path) ?? "")');
  });

  it("shows what the field will resolve to, either way", () => {
    // The whole failure of the old text box: no way to tell a good address
    // from a typo without saving and going to look.
    expect(field).toContain('stores === "url" ? path || null : publicCoverUrl(path || null)');
  });
});

describe("showing it", () => {
  it("fills the empty square in the offers list", () => {
    // An offer granting an app has no product cover to borrow.
    expect(thumb).toContain("publicCoverUrl(coverPath) ?? imageUrl");
    expect(list).toContain("imageUrl={o.imageUrl}");
  });

  it("prefers the product's cover where there is one", () => {
    // A product-granting offer should look like the product it sells.
    expect(thumb).toMatch(/publicCoverUrl\(coverPath\) \?\? imageUrl/);
  });

  it("puts it on the app card in the library, ahead of the letter", () => {
    expect(libLib).toContain("image_url");
    expect(libLib).toContain("imageUrl: imageByOffer.get(r.offer_id as string) ?? null");
    expect(library).toContain("{a.imageUrl ? (");
  });

  it("keeps the letter for an app with no picture", () => {
    // A mark drawn from the name is what you use when there is nothing better.
    expect(library).toContain("a.name.trim().charAt(0).toUpperCase()");
  });

  it("puts it on the standing offer, the one place a member met it bare", () => {
    expect(library).toContain("{standing.imageUrl && (");
  });
});

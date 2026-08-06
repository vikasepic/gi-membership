import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { COVER_ASPECT, COVER_SIZE_LABEL, COVER_WIDTH, COVER_HEIGHT, coverWarnings } from "@/lib/cover";

// One image, one shape. The bug this replaces: the same file was drawn 16:10
// on the storefront and 4:5 in the library, so a cover was re-cropped to
// portrait the moment a buyer opened what they had bought.

describe("the recommended size", () => {
  it("matches the ratio every surface draws", () => {
    expect(COVER_WIDTH / COVER_HEIGHT).toBeCloseTo(16 / 10, 5);
  });

  it("is stated as pixels, not as a ratio", () => {
    // "16:10" is something to work out. "1600 × 1000" is something to make.
    expect(COVER_SIZE_LABEL).toMatch(/^\d+ × \d+$/);
  });
});

describe("what someone is told about the file they picked", () => {
  it("says nothing about an image that is already right", () => {
    expect(coverWarnings(COVER_WIDTH, COVER_HEIGHT)).toEqual([]);
  });

  it("says nothing about a bigger image of the same shape", () => {
    expect(coverWarnings(3200, 2000)).toEqual([]);
  });

  it("forgives a ratio that is slightly off", () => {
    // A tenth off is invisible once cropped; warning about it teaches people
    // to ignore the warnings.
    expect(coverWarnings(1600, 950)).toEqual([]);
  });

  it("says which way a portrait image will be cropped", () => {
    const [w] = coverWarnings(1000, 1600);
    expect(w).toContain("top and bottom");
  });

  it("says which way a very wide image will be cropped", () => {
    const [w] = coverWarnings(3000, 800);
    expect(w).toContain("sides");
  });

  it("warns about an image too small to stay sharp", () => {
    expect(coverWarnings(600, 375)[0]).toContain("soft");
  });

  it("can say both things about one file", () => {
    expect(coverWarnings(400, 900)).toHaveLength(2);
  });
});

describe("every surface draws a cover the same shape", () => {
  const SURFACES = [
    "components/product-card.tsx",
    "app/(store)/p/[slug]/page.tsx",
    "app/(store)/page.tsx",
    "components/library/course-overview.tsx",
    // The product's cover is drawn by the editor's preview now — the separate
    // upload card it used to live in is gone.
    "components/admin/editor-preview.tsx",
    "components/admin/course-content.tsx",
  ];

  it.each(SURFACES)("%s uses the shared constant", (file) => {
    expect(readFileSync(file, "utf8")).toContain("COVER_ASPECT");
  });

  it.each(SURFACES)("%s crops no image to another ratio", (file) => {
    // Only where an image is actually being CROPPED — object-cover — because a
    // panel may legitimately be any shape it likes. The library cropped a
    // landscape cover to 4:5 here, which reframed it for exactly the people
    // who had paid for the thing.
    const cropping = readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.includes("object-cover") && /aspect-\[[0-9]+\/[0-9]+\]/.test(l));
    expect(cropping, file).toEqual([]);
  });

  it("is the ratio the constant says", () => {
    expect(COVER_ASPECT).toBe("aspect-[16/10]");
  });
});

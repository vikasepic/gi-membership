import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { KINDS, kindOf, nameFromFile } from "@/lib/media-library";

// The library exists because a file used to be a property of whatever it was
// uploaded to: the same photo on a product, its sales page and its course was
// three uploads, three names, and no way to get from one to the others.

describe("what a picker is allowed to offer", () => {
  it("sorts a file into one kind", () => {
    expect(kindOf("image/webp")).toBe("image");
    expect(kindOf("audio/mpeg")).toBe("audio");
    expect(kindOf("application/pdf")).toBe("document");
  });

  it("refuses to guess at something it does not know", () => {
    // Better absent from the library than offered to an image picker.
    expect(kindOf("application/octet-stream")).toBeNull();
    expect(kindOf("video/mp4")).toBeNull();
  });

  it("never puts one mime type in two kinds", () => {
    // An image picker offering a PDF puts a broken image on a live sales page,
    // and nothing about the choice looks wrong at the time.
    for (const mime of ["image/png", "audio/wav", "application/pdf", "text/plain"]) {
      const hits = Object.values(KINDS).filter((ps) => ps.some((p) => mime.startsWith(p)));
      expect(hits, mime).toHaveLength(1);
    }
  });
});

describe("the name a file arrives with", () => {
  it("drops the extension and the underscores", () => {
    expect(nameFromFile("IMG_4021_final_v2.jpg")).toBe("IMG 4021 final v2");
  });

  it("keeps something when there is nothing to keep", () => {
    expect(nameFromFile(".gitkeep").length).toBeGreaterThan(0);
  });

  it("does not overflow the column", () => {
    expect(nameFromFile("a".repeat(400) + ".png").length).toBeLessThanOrEqual(120);
  });
});

describe("the boundary between the two buckets", () => {
  const media = readFileSync("lib/media.ts", "utf8");

  it("refuses a paid asset as a public cover", () => {
    // A cover is fetched by anyone who loads the page. Letting one point at the
    // private bucket either publishes paid content or 404s for every visitor.
    expect(media).toContain('row.bucket !== "public-media"');
  });

  it("refuses public artwork as a lesson file", () => {
    expect(media).toContain('row.bucket !== "paid-assets"');
  });

  it("refuses a non-image as a cover", () => {
    expect(media).toContain('!row.mime.startsWith("image/")');
  });
});

describe("every form that takes a file", () => {
  const FORMS = ["app/admin/actions.ts", "app/admin/courses/[id]/content/actions.ts"];

  it.each(FORMS)("%s accepts one from the library", (file) => {
    expect(readFileSync(file, "utf8")).toContain("pickedFile(formData");
  });

  it.each(FORMS)("%s still accepts a posted file", (file) => {
    // The window is how anyone chooses one now, but the action must not depend
    // on that: it is the only thing standing between a form post and storage.
    expect(readFileSync(file, "utf8")).toContain("instanceof File");
  });

  it("gives the page builder the same window", () => {
    // Its images used to go through their own upload action into their own
    // folder, which is exactly how the same picture ended up stored three times.
    const src = readFileSync("components/admin/block-editor.tsx", "utf8");
    expect(src).toContain("MediaButton");
    expect(src).not.toContain("uploadSectionImageAction");
  });

  it("uploads from inside the window", () => {
    // Otherwise choosing a picture that is not there yet means closing the
    // window, finding an upload box, and coming back to look for it.
    expect(readFileSync("app/api/media/library/route.ts", "utf8")).toContain(
      "export async function POST",
    );
  });
});

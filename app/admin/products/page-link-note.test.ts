import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/admin/products/[id]/page-editor/page.tsx", "utf8");
const route = readFileSync("app/(store)/p/[slug]/page.tsx", "utf8");

/**
 * The admin said the public link was live. It was not.
 *
 * `/p/[slug]` calls `notFound()` for anything that is not published, so a draft
 * product's address 404s however much of a sales page is saved against it. The
 * editor's note promised the opposite — "live as soon as you save any section"
 * — and somebody built a page, opened the link and got a 404 with the screen
 * telling them it was working.
 */
describe("the public link says what will actually happen", () => {
  it("is the guard that makes this matter", () => {
    expect(route).toContain('product.status !== "published"');
    expect(route).toContain("notFound()");
  });

  it("does not promise a draft is live", () => {
    // The unconditional promise is gone; what is left has to be conditional on
    // the status, or it is the same lie with different words.
    expect(src).toContain("product.status ===");
    const promise = /note=\{?\s*"Live as soon as you save any section/.test(src);
    expect(promise, "the note is unconditional again").toBe(false);
  });

  it("says the word 404, because that is what the reader will see", () => {
    expect(src).toContain("404s for everyone until you publish it");
  });
});

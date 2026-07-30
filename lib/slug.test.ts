import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("The Deep Work Course")).toBe("the-deep-work-course");
  });
  it("collapses runs of punctuation and spaces into one hyphen", () => {
    expect(slugify("Focus  &  Flow!!!")).toBe("focus-flow");
  });
  it("trims leading and trailing hyphens", () => {
    expect(slugify("  — hello — ")).toBe("hello");
  });
  it("strips accents", () => {
    expect(slugify("Café Résumé")).toBe("cafe-resume");
  });
  it("produces output that satisfies the slug constraint", () => {
    const out = slugify("Anything Goes: 2026 Edition (v2)");
    expect(out).toMatch(/^[a-z0-9-]+$/);
    expect(out).not.toMatch(/^-|-$/);
  });
  it("returns empty string when nothing usable remains", () => {
    expect(slugify("!!!")).toBe("");
  });
});

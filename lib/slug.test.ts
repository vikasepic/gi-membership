import { describe, it, expect } from "vitest";
import { slugify, slugDraft } from "@/lib/slug";

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


/**
 * Typing "funnel-kit" produced "funnelkit".
 *
 * `slugify` trims hyphens off both ends, which is right for a finished slug and
 * impossible to type through: the field normalised on every keystroke, so the
 * hyphen was deleted the instant it was typed and the next letter landed
 * against the last one.
 */
describe("a slug being typed", () => {
  it("keeps the hyphen you just typed", () => {
    expect(slugDraft("funnel-")).toBe("funnel-");
  });

  it("lets a whole hyphenated slug be typed one key at a time", () => {
    // The actual failure, reproduced: feed it a character at a time and see
    // what the field would hold at the end.
    let held = "";
    for (const ch of "funnel-kit") held = slugDraft(held + ch);
    expect(held).toBe("funnel-kit");
  });

  it("still refuses everything slugify refuses", () => {
    expect(slugDraft("Funnel Kit")).toBe("funnel-kit");
    expect(slugDraft("  --Café  KIT!! ")).toBe("cafe-kit");
    expect(slugDraft("a//b")).toBe("a-b");
  });

  it("never starts with a hyphen", () => {
    expect(slugDraft("-abc")).toBe("abc");
    expect(slugDraft("---")).toBe("");
  });

  it("collapses a run rather than keeping several", () => {
    expect(slugDraft("a---b")).toBe("a-b");
    expect(slugDraft("a--")).toBe("a-");
  });

  it("is finished by slugify, which is what blur and the server run", () => {
    expect(slugify(slugDraft("funnel-"))).toBe("funnel");
    expect(slugify(slugDraft("funnel-kit"))).toBe("funnel-kit");
  });
});

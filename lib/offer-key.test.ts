import { describe, it, expect } from "vitest";
import { offerKeyProblem } from "@/lib/offer-key";

describe("what an offer's link is allowed to be", () => {
  it("accepts a normal one", () => {
    expect(offerKeyProblem("content-engine-instagram")).toBeNull();
    expect(offerKeyProblem("150-product-ideas")).toBeNull();
  });

  it("refuses capitals, and says why in words an admin can act on", () => {
    // The reason this matters is not style. A key with a capital saves fine
    // here and then makes the whole offer unsaveable in the main form, whose
    // schema is lowercase-only — the admin would hit "key: lowercase, numbers,
    // hyphens only" on an edit they did not make.
    const problem = offerKeyProblem("content-engine-Instagram");
    expect(problem).toMatch(/lowercase/i);
  });

  it("refuses spaces and anything that would need escaping in a URL", () => {
    for (const bad of ["content engine", "content/engine", "content?engine", "café"]) {
      expect(offerKeyProblem(bad)).not.toBeNull();
    }
  });

  it("refuses an empty one rather than making a link to nowhere", () => {
    expect(offerKeyProblem("")).not.toBeNull();
    expect(offerKeyProblem("   ")).not.toBeNull();
  });

  it("refuses one long enough to be a problem in an address bar", () => {
    expect(offerKeyProblem("a".repeat(81))).not.toBeNull();
    expect(offerKeyProblem("a".repeat(80))).toBeNull();
  });

  it("ignores surrounding whitespace rather than refusing a pasted value", () => {
    // Somebody pasting from a doc brings a trailing space with them, and
    // refusing that teaches nothing.
    expect(offerKeyProblem("  content-engine-instagram  ")).toBeNull();
  });
});

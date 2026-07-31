import { describe, it, expect } from "vitest";
import { parseOtoSections, sectionsToForm, readOtoSections } from "@/lib/oto-sections";

describe("parseOtoSections", () => {
  it("parses pipe-separated lines into sections", () => {
    const s = parseOtoSections({
      stats: "~2 hrs | Time required\n$47 | Investment",
      benefits: "Authority | People take you seriously",
      testimonials: "Gayatri | 5x faster | It changed how I work",
      comparison: "Ghostwriter | $10k–$50k | 6–12 months",
      faq: "Do I own it? | Yes, entirely.",
      problem: "You already know\n\nAnd yet here you are.",
    });
    expect(s.stats).toEqual([
      { value: "~2 hrs", label: "Time required" },
      { value: "$47", label: "Investment" },
    ]);
    expect(s.benefits).toEqual([{ title: "Authority", body: "People take you seriously" }]);
    expect(s.testimonials).toEqual([
      { name: "Gayatri", result: "5x faster", quote: "It changed how I work" },
    ]);
    expect(s.comparison).toEqual([{ option: "Ghostwriter", cost: "$10k–$50k", time: "6–12 months" }]);
    expect(s.faq).toEqual([{ q: "Do I own it?", a: "Yes, entirely." }]);
    expect(s.problem).toContain("You already know");
  });

  it("omits empty sections entirely, so the template skips them", () => {
    expect(parseOtoSections({})).toEqual({});
    expect(parseOtoSections({ stats: "\n  \n" })).toEqual({});
  });

  // A half-written line is kept rather than dropped: showing it is how the
  // author notices it is half-written.
  it("keeps a line that is missing later fields", () => {
    expect(parseOtoSections({ benefits: "Just a title" }).benefits).toEqual([
      { title: "Just a title", body: "" },
    ]);
  });

  it("round-trips back into the form", () => {
    const original = { stats: "~2 hrs | Time required", faq: "Q | A" };
    const back = sectionsToForm(parseOtoSections(original));
    expect(back.stats).toBe("~2 hrs | Time required");
    expect(back.faq).toBe("Q | A");
  });
});

describe("readOtoSections", () => {
  // The column is jsonb and this page runs after a payment: anything unexpected
  // must render an upsell without that section, never throw.
  it("tolerates junk", () => {
    expect(readOtoSections(null)).toEqual({});
    expect(readOtoSections("nonsense")).toEqual({});
    expect(readOtoSections([1, 2, 3])).toEqual({});
    expect(readOtoSections({ stats: "not-an-array" })).toEqual({});
  });

  it("reads well-formed sections", () => {
    expect(readOtoSections({ faq: [{ q: "a", a: "b" }] }).faq).toHaveLength(1);
  });
});

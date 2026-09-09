import { describe, it, expect } from "vitest";
import { POST_IDEA_MAX, parseGenerateInput, userMessageFor } from "./generate";

describe("parseGenerateInput", () => {
  it("requires a post idea and caps its length", () => {
    expect(parseGenerateInput({})).toEqual({ ok: false, error: "post_idea is required" });
    expect(parseGenerateInput({ post_idea: "   " })).toEqual({ ok: false, error: "post_idea is required" });
    expect(parseGenerateInput({ post_idea: "x".repeat(POST_IDEA_MAX + 1) })).toEqual({
      ok: false,
      error: "post_idea_too_long",
    });
  });

  it("trims and caps the optional fields, and only knows two formats", () => {
    const r = parseGenerateInput({
      post_idea: " pricing from fear ",
      niche: " coaching ",
      audience: "a".repeat(500),
      tone: 42,
      format: "story",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.postIdea).toBe("pricing from fear");
    expect(r.input.niche).toBe("coaching");
    expect(r.input.audience).toHaveLength(200);
    expect(r.input.tone).toBe("");
    expect(r.input.format).toBe("carousel");
    expect(parseGenerateInput({ post_idea: "x", format: "reel" })).toMatchObject({
      ok: true,
      input: { format: "reel" },
    });
  });
});

describe("userMessageFor", () => {
  it("tells the model what to infer, and which year it is", () => {
    const m = userMessageFor(
      { postIdea: "idea", niche: "", audience: "coaches", tone: "", format: "reel" },
      2026,
    );
    expect(m).toContain("POST_IDEA: idea");
    expect(m).toContain("NICHE: (not provided");
    expect(m).toContain("AUDIENCE: coaches");
    expect(m).toContain("FORMAT: reel");
    expect(m).toContain("TONE: (not provided");
    expect(m).toContain("CURRENT_YEAR: 2026");
  });
});

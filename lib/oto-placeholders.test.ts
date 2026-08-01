import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The approved design ships marked placeholder blocks so the client can see the
// whole structure while the copy is still being written. Those must never reach
// a buyer: a page that says "Placeholder" to someone who has just paid is worse
// than one section short.
//
// Every placeholder block is therefore gated on view.preview, which only the
// admin preview route sets. This reads the source because the failure mode is a
// new block being added without the gate.

const source = readFileSync("components/oto/custom/content-engine.tsx", "utf8");

describe("upsell placeholders never reach a buyer", () => {
  it("gates the preview-only sections on view.preview", () => {
    // Testimonials and bonuses are whole sections; both are conditional.
    const gated = source.match(/\{view\.preview && \(/g) ?? [];
    expect(gated.length).toBeGreaterThanOrEqual(2);
  });

  it("makes the Placeholder component return null outside preview", () => {
    expect(source).toMatch(/function Placeholder[\s\S]{0,200}if \(!view\.preview\) return null;/);
  });

  it("labels every placeholder as preview-only", () => {
    // If the words reach a buyer at all, they should at least be unambiguous
    // in the admin — and the label is what makes an accidental leak obvious.
    const labels = source.match(/Placeholder — preview only/g) ?? [];
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });

  it("only the preview route sets the flag", () => {
    const previewRoute = readFileSync("app/oto-preview/[id]/page.tsx", "utf8");
    const livePage = readFileSync("app/(store)/checkout/oto/page.tsx", "utf8");
    expect(previewRoute).toContain("preview: true");
    expect(livePage).not.toContain("preview: true");
  });
});

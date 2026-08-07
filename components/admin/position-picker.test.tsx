import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PositionPicker } from "@/components/admin/position-picker";
import { normalizePosition, normalizeBackground, BG_POSITIONS } from "@/lib/blocks";

// Three keywords could not describe a face in the top-left corner.

describe("what a position may be", () => {
  it("accepts all nine named spots", () => {
    for (const p of BG_POSITIONS) expect(normalizePosition(p)).toBe(p);
  });

  it("accepts a percentage pair", () => {
    expect(normalizePosition("42% 80%")).toBe("42% 80%");
    expect(normalizePosition("0% 0%")).toBe("0% 0%");
    expect(normalizePosition("100% 100%")).toBe("100% 100%");
  });

  it("keeps what the old three keywords meant", () => {
    // Pages saved before this must keep looking the way they did.
    expect(normalizePosition("center")).toBe("center center");
    expect(normalizePosition("top")).toBe("center top");
    expect(normalizePosition("bottom")).toBe("center bottom");
  });

  it("refuses anything else rather than escaping it", () => {
    // This lands in a style declaration, and the set of legal forms is small
    // and knowable — accepting only those is simpler than making an arbitrary
    // string safe.
    expect(normalizePosition("red; background:url(x)")).toBe("center center");
    expect(normalizePosition("200% 5%")).toBe("center center");
    expect(normalizePosition("50%")).toBe("center center");
    expect(normalizePosition(undefined)).toBe("center center");
  });

  it("survives a round trip through a stored background", () => {
    expect(normalizeBackground({ position: "right bottom" }).position).toBe("right bottom");
    expect(normalizeBackground({ position: "nonsense" }).position).toBe("center center");
  });
});

describe("the picker", () => {
  const at = (value: string) =>
    renderToStaticMarkup(<PositionPicker value={value} onChange={() => {}} />);

  it("is a grid of the nine, not a list of nine phrases", () => {
    // The control is a picture of the thing it sets: a corner you point at
    // rather than two words you read and map onto a rectangle.
    const out = at("center center");
    expect(out).toContain('aria-label="Top left"');
    expect(out).toContain('aria-label="Bottom right"');
    expect(out).toContain("grid-cols-3");
  });

  it("marks the one in use", () => {
    expect(at("right top")).toContain('aria-label="Top right" aria-pressed="true"');
  });

  it("names it in words too", () => {
    expect(at("left bottom")).toContain("Bottom left");
  });

  it("offers custom without leading with it", () => {
    // What you reach for when none of the nine is right — rarely, never first.
    const out = at("center center");
    expect(out).toContain("Custom…");
    expect(out).not.toContain("Across");
  });

  it("opens on the sliders when the value already is custom", () => {
    const out = at("30% 70%");
    expect(out).toContain("Across");
    expect(out).toContain("30% 70%");
  });
});

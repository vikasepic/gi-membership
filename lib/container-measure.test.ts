import { describe, it, expect } from "vitest";
import { newBlock, type Block } from "@/lib/blocks";
import { rowLayout, BAND_MEASURE } from "@/lib/block-style";
import { bandTheme } from "@/lib/page-sections";

const paper = bandTheme("paper");

const row = (props: Record<string, unknown>): Block => {
  const r = newBlock("row");
  return { ...r, props: { ...r.props, ...props } };
};

// Boxed used to mean 1040px and only 1040px, so on a full-width band the one
// control that could narrow a container was a number nobody could reach.
describe("a container's own measure", () => {
  it("is the page's measure until one is given", () => {
    expect(rowLayout(row({ contentWidth: "boxed" }), paper).container.maxWidth).toBe(
      `${BAND_MEASURE}px`,
    );
  });

  it("takes the measure it was given", () => {
    expect(
      rowLayout(row({ contentWidth: "boxed", contentMaxWidth: 720 }), paper).container.maxWidth,
    ).toBe("720px");
  });

  it("takes per cent as per cent", () => {
    expect(
      rowLayout(
        row({ contentWidth: "boxed", contentMaxWidth: 80, contentMaxWidthUnit: "%" }),
        paper,
      ).container.maxWidth,
    ).toBe("80%");
  });

  it("clamps a slipped keystroke", () => {
    expect(
      rowLayout(row({ contentWidth: "boxed", contentMaxWidth: 99999 }), paper).container.maxWidth,
    ).toBe("2400px");
    expect(
      rowLayout(
        row({ contentWidth: "boxed", contentMaxWidth: 400, contentMaxWidthUnit: "%" }),
        paper,
      ).container.maxWidth,
    ).toBe("100%");
  });

  it("caps nothing at all when the container is full", () => {
    expect(
      rowLayout(row({ contentWidth: "full", contentMaxWidth: 720 }), paper).container.maxWidth,
    ).toBeUndefined();
  });
});

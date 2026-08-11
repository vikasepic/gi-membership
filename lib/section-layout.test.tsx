import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionBand } from "@/components/page/sales-page";
import {
  defaultRows,
  normalizeSectionLayout,
  layoutIsDefault,
  BAND_WIDTH,
  SECTION_LIMITS,
  type SectionRow,
} from "@/lib/page-sections";
import { newBlock } from "@/lib/blocks";

const band = (layout: unknown): string => {
  const row: SectionRow = {
    ...defaultRows().find((r) => r.sectionKey === "benefits")!,
    content: { blocks: [{ ...newBlock("heading"), props: { text: "On the band", tag: "h2" } }] },
    layout,
  };
  return renderToStaticMarkup(
    <SectionBand row={row} money={{ priceLabel: null, termsLabel: null }} preview />,
  );
};

describe("how wide a band holds its content", () => {
  it("is the built-in measure until somebody says otherwise", () => {
    // The classes, not a style attribute: an untouched band has to emit
    // character for character what it emitted before this setting existed,
    // including the md: breakpoint that a flat number could not express.
    const html = band(null);
    expect(html).toContain("px-6 py-12 md:py-16");
    expect(html).toContain(`max-width:${BAND_WIDTH}px`);
  });

  it("lets content reach the screen edge on full", () => {
    const html = band({ width: "full", maxWidth: null, padX: null, padY: null });
    expect(html).not.toContain(`max-width:${BAND_WIDTH}px`);
    // The built-in padding classes step aside once a layout is set, or the
    // md: rule would outrank whatever was chosen.
    expect(html).not.toContain("px-6 py-12 md:py-16");
  });

  it("caps at the measure given on custom", () => {
    const html = band({ width: "custom", maxWidth: 720, padX: null, padY: null });
    expect(html).toContain("max-width:720px");
  });

  it("takes the air away when padding is zero", () => {
    // Zero is a real answer, distinct from blank: it is what a photograph
    // standing on the band's bottom edge needs, and it is why the templates no
    // longer carry a negative margin to fake it.
    const html = band({ width: "full", maxWidth: null, padX: 0, padY: 0 });
    expect(html).toMatch(/padding-inline:\s*0px/);
    expect(html).toMatch(/padding-block:\s*0px/);
  });

  it("keeps the band's own colour whatever the width", () => {
    expect(band({ width: "full", maxWidth: null, padX: 0, padY: 0 })).toContain("background:");
  });
});

describe("reading a stored layout", () => {
  it("treats junk as the built-in", () => {
    for (const junk of [null, undefined, 42, "full", [], { width: "sideways" }]) {
      expect(layoutIsDefault(normalizeSectionLayout(junk))).toBe(true);
    }
  });

  it("keeps zero, which is not the same as unset", () => {
    const l = normalizeSectionLayout({ width: "full", padX: 0, padY: 0, maxWidth: null });
    expect(l.padX).toBe(0);
    expect(l.padY).toBe(0);
    expect(layoutIsDefault(l)).toBe(false);
  });

  it("refuses a negative measure rather than emitting one", () => {
    expect(normalizeSectionLayout({ width: "custom", maxWidth: -40 }).maxWidth).toBeNull();
  });

  it("clamps a slipped keystroke instead of emitting it", () => {
    // A typed 100343 in Top & bottom really did produce a band a hundred
    // thousand pixels tall. The control caps it now, and so does the reader —
    // a value can arrive from stored JSON without passing the control at all.
    expect(normalizeSectionLayout({ width: "boxed", padY: 100343 }).padY).toBe(
      SECTION_LIMITS.pad.px,
    );
    expect(normalizeSectionLayout({ width: "custom", maxWidth: 99999 }).maxWidth).toBe(
      SECTION_LIMITS.maxWidth.px,
    );
  });

  it("keeps per cent as per cent", () => {
    const l = normalizeSectionLayout({ width: "custom", maxWidth: 90, maxWidthUnit: "%", padX: 5, padXUnit: "%" });
    expect(l.maxWidthUnit).toBe("%");
    expect(l.padXUnit).toBe("%");
    expect(l.padX).toBe(5);
  });
});

describe("the band's box", () => {
  it("emits the unit that was chosen", () => {
    const html = band({
      width: "custom",
      maxWidth: 90,
      maxWidthUnit: "%",
      padX: 4,
      padXUnit: "%",
      padY: 40,
      padYUnit: "px",
    });
    expect(html).toContain("max-width:90%");
    expect(html).toMatch(/padding-inline:\s*4%/);
    expect(html).toMatch(/padding-block:\s*40px/);
  });

  it("caps a percentage measure at the screen", () => {
    expect(normalizeSectionLayout({ width: "custom", maxWidth: 400, maxWidthUnit: "%" }).maxWidth).toBe(
      SECTION_LIMITS.maxWidth["%"],
    );
  });
});

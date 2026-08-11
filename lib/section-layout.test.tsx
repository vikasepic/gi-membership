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
    const html = band({ width: "full", maxWidth: null, pad: { t: 0, r: 0, b: 0, l: 0 } });
    expect(html).toMatch(/padding-top:\s*0px/);
    expect(html).toMatch(/padding-bottom:\s*0px/);
    expect(html).toMatch(/padding-left:\s*0px/);
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
    const l = normalizeSectionLayout({ width: "full", pad: { t: 0, r: 0, b: 0, l: 0 }, maxWidth: null });
    expect(l.pad.t).toBe(0);
    expect(l.pad.b).toBe(0);
    expect(layoutIsDefault(l)).toBe(false);
  });

  it("refuses a negative measure rather than emitting one", () => {
    expect(normalizeSectionLayout({ width: "custom", maxWidth: -40 }).maxWidth).toBeNull();
  });

  it("clamps a slipped keystroke instead of emitting it", () => {
    // A typed 100343 in Top & bottom really did produce a band a hundred
    // thousand pixels tall. The control caps it now, and so does the reader —
    // a value can arrive from stored JSON without passing the control at all.
    expect(normalizeSectionLayout({ width: "boxed", pad: { t: 100343, r: null, b: null, l: null } }).pad.t).toBe(
      SECTION_LIMITS.pad.px,
    );
    expect(normalizeSectionLayout({ width: "custom", maxWidth: 99999 }).maxWidth).toBe(
      SECTION_LIMITS.maxWidth.px,
    );
  });

  it("keeps per cent as per cent", () => {
    const l = normalizeSectionLayout({ width: "boxed", maxWidth: 90, maxWidthUnit: "%", pad: { t: 5, r: 5, b: 5, l: 5 }, padUnit: "%" });
    expect(l.maxWidthUnit).toBe("%");
    expect(l.padUnit).toBe("%");
    expect(l.pad.t).toBe(5);
  });
});

describe("the band's box", () => {
  it("emits the unit that was chosen", () => {
    const html = band({
      width: "boxed",
      maxWidth: 90,
      maxWidthUnit: "%",
      pad: { t: 4, r: 4, b: 4, l: 4 },
      padUnit: "%",
    });
    expect(html).toContain("max-width:90%");
    expect(html).toMatch(/padding-top:\s*4%/);
    expect(html).toMatch(/padding-left:\s*4%/);
  });

  it("sets each side on its own", () => {
    // Air above and none below is the whole point — one number for "top and
    // bottom" cannot say it, and that is what a photograph standing on the
    // band's edge needs.
    const html = band({ width: "boxed", pad: { t: 48, r: null, b: 0, l: null }, padUnit: "px" });
    expect(html).toMatch(/padding-top:\s*48px/);
    expect(html).toMatch(/padding-bottom:\s*0px/);
    // The sides were left blank, so they keep the built-in rather than falling
    // to zero with the ones that were set.
    expect(html).not.toMatch(/padding-left:\s*0px/);
  });

  it("caps a percentage measure at the screen", () => {
    expect(
      normalizeSectionLayout({ width: "boxed", maxWidth: 400, maxWidthUnit: "%" }).maxWidth,
    ).toBe(SECTION_LIMITS.maxWidth["%"]);
  });

  it("reads a band stored under the old three-mode shape", () => {
    // `custom` was a width mode for an afternoon, and padX/padY were the
    // padding. Anything saved in between has to come back as what it meant.
    const l = normalizeSectionLayout({ width: "custom", maxWidth: 720, padX: 12, padY: 30 });
    expect(l.width).toBe("boxed");
    expect(l.maxWidth).toBe(720);
    expect(l.pad).toEqual({ t: 30, r: 12, b: 30, l: 12 });
  });
});

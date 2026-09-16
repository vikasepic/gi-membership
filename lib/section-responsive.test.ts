import { describe, it, expect } from "vitest";
import {
  normalizeSectionLayout,
  sectionAt,
  sectionRules,
  setSectionOverride,
  layoutIsDefault,
} from "@/lib/page-sections";
import { emptyBackground } from "@/lib/blocks";

/**
 * A band's padding, colour and background, per device.
 *
 * Asked for 16 Sep 2026: blocks could say "different on a phone" for all
 * three and a band could not, so a photograph that suited a laptop had to
 * suit a phone too. The overrides ride inside `layout` so no row changes
 * shape; a band nobody made responsive reads and renders exactly as before.
 */
const photo = { ...emptyBackground(), type: "classic" as const, image: "https://x.test/wide.jpg" };
const stored = {
  pad: { t: 80, r: null, b: 80, l: null },
  padUnit: "px",
  responsive: {
    tablet: { pad: { t: 48, r: null, b: 48, l: null } },
    mobile: { background: { type: "classic", color: "#11325b", image: "" } },
  },
};

describe("what is stored", () => {
  it("keeps the overrides through normalize, clamped like the rest", () => {
    const l = normalizeSectionLayout({ ...stored, responsive: { mobile: { pad: { t: 99999, r: null, b: null, l: null } } } });
    expect(l.responsive?.mobile?.pad?.t).toBe(200);
    expect(l.responsive?.tablet).toBeUndefined();
  });
  it("drops an override that says nothing", () => {
    expect(normalizeSectionLayout({ responsive: { mobile: {} } }).responsive).toBeUndefined();
  });
  it("is still the default when only overrides are set", () => {
    // A band that changes nothing on a laptop keeps the built-in classes there.
    expect(layoutIsDefault(normalizeSectionLayout({ responsive: { mobile: { pad: { t: 0, r: 0, b: 0, l: 0 } } } }))).toBe(true);
  });
});

describe("resolving a device", () => {
  const row = { style: "paper", background: photo, layout: stored };
  it("is the row itself on desktop", () => {
    const d = sectionAt(row, "desktop");
    expect(d.style).toBe("paper");
    expect(d.background).toEqual(photo);
    expect(d.pad).toEqual({ t: 80, r: null, b: 80, l: null });
  });
  it("layers tablet over desktop", () => {
    const t = sectionAt(row, "tablet");
    expect(t.pad).toEqual({ t: 48, r: null, b: 48, l: null });
    expect(t.background).toEqual(photo);
  });
  it("layers mobile over tablet, side by side rather than all or nothing", () => {
    const m = sectionAt(row, "mobile");
    // The pad came from the tablet, the colour and background from the phone.
    expect(m.pad).toEqual({ t: 48, r: null, b: 48, l: null });
    expect(m.background?.color).toBe("#11325b");
    expect(m.background?.image).toBe("");
  });
});

describe("the rules a live band emits", () => {
  it("emits nothing for a band with no overrides", () => {
    expect(sectionRules("section-hero", { style: "paper", background: null, layout: { pad: { t: 40, r: null, b: 40, l: null } } })).toBe("");
  });
  it("writes each device's differences under its media query, important, on the band's id", () => {
    const css = sectionRules("section-hero", { style: "paper", background: photo, layout: stored });
    expect(css).toContain("@media (max-width:1023px){#section-hero{padding-top:48px !important;padding-bottom:48px !important}}");
    expect(css).toContain("@media (max-width:767px){#section-hero{");
    expect(css).toContain("background-color:#11325b !important");
    expect(css).toContain("background-image:none !important");
    // The tablet changed only its padding, so the photo is not restated there.
    expect(css.split("@media")[1]).not.toContain("wide.jpg");
  });
});

describe("writing an override", () => {
  it("merges over what the device had, and removes a key set to null", () => {
    const pad = { t: 24, r: null, b: 24, l: null };
    const l1 = setSectionOverride(stored, "mobile", { pad });
    // The background is normalised on the way in, so compare the parts that matter.
    expect(l1.responsive?.mobile?.pad).toEqual(pad);
    expect(l1.responsive?.mobile?.background?.color).toBe("#11325b");
    const l2 = setSectionOverride(l1, "mobile", { pad: null, background: null });
    expect(l2.responsive?.mobile).toBeUndefined();
    expect(l2.responsive?.tablet).toBeDefined();
    const l3 = setSectionOverride(l2, "tablet", { pad: null });
    expect(l3.responsive).toBeUndefined();
  });
});

import { describe, it, expect } from "vitest";
import { resolveOtoTemplate, DEFAULT_OTO_TEMPLATE } from "@/lib/oto-template";

// The upsell page is only ever reached after a successful payment, so every
// path through this has to land on a real layout.
describe("resolveOtoTemplate", () => {
  const none: string[] = [];

  it("returns each named template", () => {
    expect(resolveOtoTemplate({ template: "short", offerKey: "x", customKeys: none })).toBe("short");
    expect(resolveOtoTemplate({ template: "visual", offerKey: "x", customKeys: none })).toBe("visual");
    expect(resolveOtoTemplate({ template: "long", offerKey: "x", customKeys: none })).toBe("long");
  });

  it("uses a coded page only when one is registered for that offer", () => {
    expect(resolveOtoTemplate({ template: "custom", offerKey: "ce", customKeys: ["ce"] })).toBe("custom");
  });

  // The likeliest real mistake: the dropdown offers "custom" before the
  // component exists, so an admin can select it and ship nothing.
  it("falls back when custom has no component registered", () => {
    expect(resolveOtoTemplate({ template: "custom", offerKey: "ce", customKeys: none })).toBe(
      DEFAULT_OTO_TEMPLATE,
    );
  });

  it("falls back for unknown, empty and missing values", () => {
    expect(resolveOtoTemplate({ template: "renamed-away", offerKey: "x", customKeys: none })).toBe(DEFAULT_OTO_TEMPLATE);
    expect(resolveOtoTemplate({ template: "", offerKey: "x", customKeys: none })).toBe(DEFAULT_OTO_TEMPLATE);
    expect(resolveOtoTemplate({ template: null, offerKey: "x", customKeys: none })).toBe(DEFAULT_OTO_TEMPLATE);
    expect(resolveOtoTemplate({ template: undefined, offerKey: "x", customKeys: none })).toBe(DEFAULT_OTO_TEMPLATE);
  });
});

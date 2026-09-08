import { describe, it, expect } from "vitest";
import { bandPatch } from "@/lib/page-sections";
import { emptyBackground } from "@/lib/blocks";

// A template's band colour is written into the section's `background` as a
// classic fill (block-editor's insertTemplate). That slot outranks the band
// preset in the renderer AND has no control in the Section panel — its
// Background group offers an image and nothing else. So the colour a template
// painted could not be changed by the only colour control on screen.

describe("picking a band colour", () => {
  it("clears a colour a template painted over the band", () => {
    const templated = { ...emptyBackground(), type: "classic" as const, color: "#e9dde6" };
    const patch = bandPatch(templated, "navy");
    expect(patch.style).toBe("navy");
    expect(patch.background?.color).toBeNull();
    // Nothing left to paint, so the band's own ground is what shows.
    expect(patch.background?.type).toBe("none");
  });

  it("keeps a background image, and only drops the colour under it", () => {
    const withImage = {
      ...emptyBackground(),
      type: "classic" as const,
      color: "#e9dde6",
      image: "library/x.webp",
    };
    const patch = bandPatch(withImage, "sand");
    expect(patch.background?.image).toBe("library/x.webp");
    expect(patch.background?.type).toBe("classic");
    expect(patch.background?.color).toBeNull();
  });

  it("writes no background at all when there is nothing to clear", () => {
    // The common case. A patch here would be a pointless write on every click.
    expect(bandPatch(emptyBackground(), "rose").background).toBeUndefined();
    expect(bandPatch(null, "rose").background).toBeUndefined();
  });
});

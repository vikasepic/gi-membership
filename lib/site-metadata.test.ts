import { describe, it, expect } from "vitest";
import { storeMetadata } from "@/lib/site-metadata";
import { SETTINGS_DEFAULTS, type Settings } from "@/lib/settings-schema";

const settings = (over: Partial<Settings> = {}): Settings =>
  ({ ...SETTINGS_DEFAULTS, ...over }) as Settings;

/**
 * The tab icon.
 *
 * This fell back from the favicon to the LOGO, which is how a live store ended
 * up with a 518×242 black wordmark in the browser tab: an unreadable smudge at
 * 16px, and invisible against a dark tab strip. A logo is wide and a favicon is
 * square; nothing here can tell which an uploaded file is without a storage
 * round trip on every render, so it must not guess.
 */
describe("what the browser tab is pointed at", () => {
  it("uses an uploaded favicon", () => {
    const icons = storeMetadata(settings({ faviconPath: "mark.png" })).icons as {
      icon: string;
    };
    expect(icons.icon).toContain("mark.png");
  });

  it("never uses the logo", () => {
    // The whole defect in one line. A logo set and no favicon must leave the
    // tab to the app's own mark.
    const md = storeMetadata(settings({ logoPath: "wordmark.svg", faviconPath: "" }));
    expect(JSON.stringify(md.icons ?? null)).not.toContain("wordmark");
  });

  it("says nothing at all when no favicon is set", () => {
    // Not an empty icons object: any `icons` key overrides Next's own
    // app/icon.png, so the way to keep the store's mark is silence.
    expect(storeMetadata(settings({ logoPath: "wordmark.svg" })).icons).toBeUndefined();
  });

  it("still falls back everywhere it should", () => {
    // The icon is the one field that must not guess. The words still do.
    const md = storeMetadata(settings({ name: "Greater Inside", tagline: "A tagline" }));
    expect(md.title).toBe("Greater Inside");
    expect(md.description).toBe("A tagline");
  });
});

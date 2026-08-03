import { describe, it, expect } from "vitest";
import {
  BUMP_ACCENT_DEFAULT,
  normalizeAccent,
  bumpInk,
  contrastRatio,
  tint,
  saveBadge,
  defaultBanner,
  buildBumpView,
} from "@/lib/bump";

const base = {
  billingType: "one_time" as const,
  priceCents: 2700,
  compareAtCents: 4700,
  currency: "usd",
  interval: null as string | null,
  trialDays: null as number | null,
  headline: "Offer headline",
  description: "Offer description",
  bumpHeadline: null as string | null,
  bumpDescription: null as string | null,
  bumpBanner: null as string | null,
  bumpBullets: null as string[] | null,
  bumpNote: null as string | null,
  bumpAccent: null as string | null,
};

describe("normalizeAccent", () => {
  it("accepts a six-digit hex, lowercased", () => {
    expect(normalizeAccent("#B0532F")).toBe("#b0532f");
  });

  it("expands the three-digit shorthand", () => {
    expect(normalizeAccent("#abc")).toBe("#aabbcc");
  });

  it("replaces anything that is not a colour", () => {
    // This value reaches a style attribute. An admin field is not a reason to
    // let arbitrary text into CSS.
    for (const bad of [
      "red; background: url(javascript:alert(1))",
      "var(--x)",
      "#12345",
      "",
      null,
      undefined,
      42,
      {},
    ]) {
      expect(normalizeAccent(bad)).toBe(BUMP_ACCENT_DEFAULT);
    }
  });
});

describe("bumpInk", () => {
  it("clears AA for every possible accent", () => {
    // The whole point of the function, and not spot-checkable: an earlier
    // version used the store's #0b0b0d ink and left a band around luminance
    // 0.183-0.190 where neither white nor ink cleared AA. #cc22cc sits in it
    // at 4.37:1, and only a sweep found it.
    let worst = Infinity;
    let worstHex = "";
    for (let r = 0; r < 256; r += 5) {
      for (let g = 0; g < 256; g += 5) {
        for (let b = 0; b < 256; b += 5) {
          const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
          const ratio = contrastRatio(hex, bumpInk(hex));
          if (ratio < worst) {
            worst = ratio;
            worstHex = hex;
          }
        }
      }
    }
    expect(worst, `worst accent was ${worstHex}`).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps white on the brand accent", () => {
    // The store's filled controls are white-on-terracotta; the default accent
    // is the darker #b0532f precisely so that stays true and still passes.
    expect(bumpInk(BUMP_ACCENT_DEFAULT)).toBe("#ffffff");
    expect(contrastRatio(BUMP_ACCENT_DEFAULT, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("switches to dark text on a pale accent", () => {
    expect(bumpInk("#ffd400")).toBe("#000000");
  });

  it("would have failed on the raw brand terracotta", () => {
    // Documents why the default is #b0532f and not #c8653d: white on the raw
    // brand colour is 3.90:1, under AA for the banner label.
    expect(contrastRatio("#c8653d", "#ffffff")).toBeLessThan(4.5);
  });
});

describe("tint", () => {
  it("produces an rgba string from a hex", () => {
    expect(tint("#b0532f", 0.09)).toBe("rgba(176, 83, 47, 0.09)");
  });
});

describe("saveBadge", () => {
  it("reports the real percentage off", () => {
    expect(saveBadge({ ...base, priceCents: 2700, compareAtCents: 4700 })).toBe("Save 43%");
  });

  it("says nothing when there is nothing to save", () => {
    // A manufactured badge is worse than no badge — it is a claim the
    // checkout would contradict.
    expect(saveBadge({ ...base, compareAtCents: null })).toBeNull();
    expect(saveBadge({ ...base, priceCents: 4700, compareAtCents: 4700 })).toBeNull();
    expect(saveBadge({ ...base, priceCents: 4700, compareAtCents: 2700 })).toBeNull();
  });

  it("prefers the trial, which is the stronger claim", () => {
    expect(
      saveBadge({ ...base, billingType: "recurring", trialDays: 7, compareAtCents: 9900 }),
    ).toBe("7 days free");
  });

  it("ignores a zero-day trial", () => {
    expect(saveBadge({ ...base, billingType: "recurring", trialDays: 0 })).toBe("Save 43%");
  });
});

describe("defaultBanner", () => {
  it("does not claim a deadline that does not exist", () => {
    // The bump sits on every checkout. "Limited time offer" would be untrue,
    // and an untrue claim beside a card field is the worst place to spend
    // trust. A real deadline can still be typed in.
    expect(defaultBanner(base)).toBe("Add to your order");
    expect(defaultBanner(base)).not.toMatch(/limited|hurry|expires/i);
  });

  it("names a real trial when there is one", () => {
    expect(defaultBanner({ billingType: "recurring", trialDays: 7 })).toBe("Free for 7 days");
  });
});

describe("buildBumpView", () => {
  it("shows the default banner when the offer has never been edited", () => {
    // Null is "not configured", not "off" — otherwise every existing offer
    // silently loses its banner the moment this ships.
    expect(buildBumpView({ ...base, bumpBanner: null }).banner).toBe("Add to your order");
  });

  it("treats an empty banner as explicitly off", () => {
    expect(buildBumpView({ ...base, bumpBanner: "" }).banner).toBeNull();
    expect(buildBumpView({ ...base, bumpBanner: "   " }).banner).toBeNull();
  });

  it("falls back to the offer's own copy when bump copy is unset", () => {
    const v = buildBumpView(base);
    expect(v.headline).toBe("Offer headline");
    expect(v.description).toBe("Offer description");
  });

  it("prefers bump-specific copy", () => {
    const v = buildBumpView({ ...base, bumpHeadline: "Add it", bumpDescription: "Short" });
    expect(v.headline).toBe("Add it");
    expect(v.description).toBe("Short");
  });

  it("drops blank bullets rather than rendering empty rows", () => {
    expect(buildBumpView({ ...base, bumpBullets: ["  ", "One", "", "Two"] }).bullets).toEqual([
      "One",
      "Two",
    ]);
  });

  it("formats the price block from the offer's own numbers", () => {
    const v = buildBumpView(base);
    expect(v.wasLabel).toBe("$47");
    expect(v.nowLabel).toBe("$27");
    expect(v.chargeNowCents).toBe(2700);
  });

  it("charges nothing today on a trial, and says what happens next", () => {
    const v = buildBumpView({
      ...base,
      billingType: "recurring",
      interval: "month",
      trialDays: 7,
      priceCents: 4700,
      compareAtCents: null,
    });
    expect(v.chargeNowCents).toBe(0);
    expect(v.nowLabel).toBe("$0");
    expect(v.termsLabel).toBe("then $47/month, cancel any time");
    expect(v.saveBadge).toBe("7 days free");
  });

  it("hides the strikethrough when it would not be a saving", () => {
    expect(buildBumpView({ ...base, compareAtCents: 2700 }).wasLabel).toBeNull();
    expect(buildBumpView({ ...base, compareAtCents: null }).wasLabel).toBeNull();
  });

  it("always yields a usable accent and matching ink", () => {
    const v = buildBumpView({ ...base, bumpAccent: "nonsense" });
    expect(v.accent).toBe(BUMP_ACCENT_DEFAULT);
    expect(contrastRatio(v.accent, v.ink)).toBeGreaterThanOrEqual(4.5);
  });
});

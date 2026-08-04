import { describe, it, expect } from "vitest";
import { contrastRatio, readableInk } from "@/lib/color";
import {
  BAND_STYLES,
  BAND_STYLE_KEYS,
  SECTIONS,
  SECTION_KEYS,
  bandTheme,
  buildSectionView,
  defaultRows,
  listOf,
  sectionDef,
  textOf,
  imageSrc,
} from "@/lib/page-sections";

describe("the nine sections", () => {
  it("keeps Ajit's ten parts, in his order", () => {
    // The reference decides how a band LOOKS; the sequence of the argument is
    // his — I moved the offer up once and had to put it back.
    expect(SECTION_KEYS).toEqual([
      "hero",
      "problem",
      "solution",
      "benefits",
      "offer",
      "authority",
      "proof",
      "value",
      "guarantee",
      "faq",
      "cta",
      "footer",
    ]);
    expect(sectionDef("hero")!.n).toBe("1 + 2");
    expect(sectionDef("cta")!.n).toBe("10");
  });

  it("marks what is his and what was added", () => {
    // The ten parts stay ten. The guarantee is part nine's third move given a
    // band of its own; the FAQ and the footer are additions and say so.
    const parts = SECTIONS.filter((d) => d.n !== "+").map((d) => d.n);
    expect(parts).toEqual(["1 + 2", "3", "4", "5", "6", "7", "8", "9", "9", "10"]);
    expect(SECTIONS.filter((d) => d.n === "+").map((d) => d.key)).toEqual(["faq", "footer"]);
  });

  it("never puts two bands with the same ground next to each other", () => {
    // getPageSections maps over this list, so this order is what a reader
    // actually walks down. Two identical grounds meeting reads as one long gap.
    const grounds = SECTIONS.map((d) => d.defaultStyle);
    for (let i = 1; i < grounds.length; i++) {
      expect(grounds[i], `${SECTIONS[i - 1].key} -> ${SECTIONS[i].key}`).not.toBe(grounds[i - 1]);
    }
  });

  it("has no duplicate keys", () => {
    expect(new Set(SECTION_KEYS).size).toBe(SECTION_KEYS.length);
  });

  it("gives every section defaults for every field it declares", () => {
    // A page that has never been edited must render as a complete page, not as
    // nine empty bands — that is what makes it safe to switch on before anyone
    // has written a word.
    const missing: string[] = [];
    for (const def of SECTIONS) {
      for (const f of def.fields) {
        if (!(f.key in def.defaults)) missing.push(`${def.key}.${f.key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("declares defaults only for fields that exist", () => {
    const stray: string[] = [];
    for (const def of SECTIONS) {
      const keys = new Set(def.fields.map((f) => f.key));
      for (const k of Object.keys(def.defaults)) if (!keys.has(k)) stray.push(`${def.key}.${k}`);
    }
    expect(stray).toEqual([]);
  });

  it("ships every list default in the shape its field declares", () => {
    // A default row missing a sub-key renders as a blank cell the moment
    // someone opens the editor and saves without touching anything.
    const bad: string[] = [];
    for (const def of SECTIONS) {
      for (const f of def.fields) {
        if (f.kind !== "list") continue;
        const rows = def.defaults[f.key];
        if (!Array.isArray(rows)) { bad.push(`${def.key}.${f.key} not an array`); continue; }
        for (const [i, r] of rows.entries()) {
          for (const sub of f.item) {
            if (typeof (r as Record<string, unknown>)[sub.key] !== "string") {
              bad.push(`${def.key}.${f.key}[${i}].${sub.key}`);
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("starts a new page with every section on and in order", () => {
    const rows = defaultRows();
    expect(rows.map((r) => r.sectionKey)).toEqual(SECTION_KEYS);
    expect(rows.map((r) => r.position)).toEqual(rows.map((_, i) => i));
    expect(rows.every((r) => r.enabled)).toBe(true);
  });

  it("never invents testimonials", () => {
    // The one hard rule on this page. Proof ships with an empty quotes list so
    // nothing can be published under a name nobody agreed to.
    expect(sectionDef("proof")!.defaults.quotes).toEqual([]);
  });
});

describe("band styles", () => {
  it("keeps body copy readable on every ground", () => {
    // The reason colours are presets rather than a free hex: a band carries
    // paragraphs, so the ground and the text have to move together.
    for (const key of BAND_STYLE_KEYS) {
      const s = BAND_STYLES[key];
      expect(contrastRatio(s.bg, s.fg), `${key}: text on ground`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps panels readable too", () => {
    for (const key of BAND_STYLE_KEYS) {
      const s = BAND_STYLES[key];
      for (const panel of [s.panel, s.panel2]) {
        expect(contrastRatio(panel, s.fg), `${key}: text on panel ${panel}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("labels every accent legibly, whatever it is set to", () => {
    for (const key of BAND_STYLE_KEYS) {
      const t = bandTheme(key);
      expect(contrastRatio(t.accent, t.onAccent), `${key} accent`).toBeGreaterThanOrEqual(4.5);
    }
    // Including an accent an admin picks by hand.
    for (const hex of ["#ffd400", "#11325b", "#cc22cc", "#000000", "#ffffff"]) {
      const t = bandTheme("paper", hex);
      expect(contrastRatio(t.accent, t.onAccent), hex).toBeGreaterThanOrEqual(4.5);
      expect(t.onAccent).toBe(readableInk(hex));
    }
  });

  it("falls back rather than throwing on an unknown style", () => {
    expect(bandTheme("nonsense").bg).toBe(BAND_STYLES.paper.bg);
    expect(bandTheme(null).bg).toBe(BAND_STYLES.paper.bg);
  });

  it("replaces an accent that is not a colour", () => {
    // It reaches a style attribute.
    expect(bandTheme("paper", "red; background:url(x)").accent).toBe(BAND_STYLES.paper.accent);
  });
});

describe("what a default is allowed to say", () => {
  // Every default here is inherited by every product and upsell page that has
  // not been written yet. Before this, they held one specific product's sales
  // letter — so a new page opened claiming another product's price, platforms
  // and credentials. A default may describe the JOB of a field. It may not
  // state a fact about a product it has never seen.
  const claimBearing = [
    ["hero", "facts"], ["hero", "stats"],
    ["offer", "stack"], ["offer", "modules"],
    ["authority", "figures"],
    ["proof", "quotes"], ["proof", "reasons"],
    ["value", "options"], ["value", "checklist"], ["faq", "faqs"],
    ["cta", "checklist"],
  ] as const;

  it.each(claimBearing)("ships %s.%s empty", (key, field) => {
    expect(sectionDef(key)!.defaults[field]).toEqual([]);
  });

  const moneyish = ["ctaNote", "priceNote", "guaranteeTitle", "guaranteeBody", "totalAmount"];
  it("states no price, trial, refund or guarantee by default", () => {
    for (const def of SECTIONS) {
      for (const f of moneyish) {
        if (f in def.defaults) expect(def.defaults[f]).toBe("");
      }
    }
  });

  it("carries no currency figure anywhere in its defaults", () => {
    const blob = JSON.stringify(SECTIONS.map((s) => s.defaults));
    expect(blob).not.toMatch(/[$£€]\s?\d/);
  });

  it("names no specific product, platform or brand", () => {
    const blob = JSON.stringify(SECTIONS.map((s) => s.defaults)).toLowerCase();
    for (const word of ["content engine", "instagram", "linkedin", "carousel", "greater inside"]) {
      expect(blob).not.toContain(word);
    }
  });
});

describe("the funnel-kit fields", () => {
  const fieldKeys = (key: string) => sectionDef(key)!.fields.map((f) => f.key);

  it("gives the hero its deliverable list, second button and audience line", () => {
    expect(fieldKeys("hero")).toEqual(expect.arrayContaining(["bullets", "ctaSecondary", "audience"]));
  });

  it("gives the problem section named traps, not just quoted chips", () => {
    expect(fieldKeys("problem")).toContain("traps");
  });

  it("offers the question grid as well as numbered steps", () => {
    expect(sectionDef("solution")!.variants?.map((v) => v.key)).toEqual(["steps", "questions"]);
  });

  it("repeats the risk-reversal at the close", () => {
    expect(fieldKeys("cta")).toContain("ctaNote");
  });

  it("restates what is included beside the price", () => {
    expect(fieldKeys("value")).toContain("checklist");
  });

  it("defaults an unset variant to the first one", () => {
    const v = buildSectionView({
      sectionKey: "solution", position: 3, enabled: true,
      style: "sand", accent: null, variant: null, content: {},
    })!;
    expect(v.variant).toBe("steps");
  });
});

describe("buildSectionView", () => {
  const row = {
    sectionKey: "solution",
    position: 3,
    enabled: true,
    style: "sand",
    accent: null,
    variant: null,
    content: {},
  };

  it("fills in the defaults for an unedited section", () => {
    const v = buildSectionView(row)!;
    expect(textOf(v.c, "heading")).toBe(sectionDef("solution")!.defaults.heading);
  });

  it("prefers stored content over the default", () => {
    const stored = { heading: "Ours", steps: [{ title: "One", body: "First" }] };
    const v = buildSectionView({ ...row, content: stored })!;
    expect(textOf(v.c, "heading")).toBe("Ours");
    // Untouched fields still come through, so a partial edit is not a blank band.
    expect(listOf(v.c.steps, ["title", "body"])).toHaveLength(1);
  });

  it("ignores empty strings so a cleared field shows the default", () => {
    const v = buildSectionView({ ...row, content: { heading: "   " } })!;
    expect(textOf(v.c, "heading")).toBe(sectionDef("solution")!.defaults.heading);
  });

  it("returns nothing for a disabled section", () => {
    expect(buildSectionView({ ...row, enabled: false })).toBeNull();
  });

  it("returns nothing for a section that no longer exists in the code", () => {
    expect(buildSectionView({ ...row, sectionKey: "retired" })).toBeNull();
  });

  it("survives junk in the stored content", () => {
    // This renders on a page a buyer reaches after paying. Malformed data
    // should cost a section, never the page.
    for (const junk of [null, "a string", 42, [], undefined]) {
      const v = buildSectionView({ ...row, content: junk });
      expect(v).not.toBeNull();
      expect(textOf(v!.c, "heading")).toBe(sectionDef("solution")!.defaults.heading);
    }
  });
});

describe("listOf", () => {
  it("drops rows where every cell is empty", () => {
    expect(listOf([{ title: "a", body: "" }, { title: "", body: "" }], ["title", "body"])).toEqual([
      { title: "a", body: "" },
    ]);
  });

  it("returns nothing for a value that is not a list", () => {
    expect(listOf("nope", ["title"])).toEqual([]);
    expect(listOf(undefined, ["title"])).toEqual([]);
  });

  it("coerces non-string cells rather than rendering [object Object]", () => {
    expect(listOf([{ title: { a: 1 }, body: "ok" }], ["title", "body"])).toEqual([
      { title: "", body: "ok" },
    ]);
  });
});

describe("imageSrc", () => {
  it("passes a full URL through", () => {
    expect(imageSrc("https://example.com/a.png")).toBe("https://example.com/a.png");
  });

  it("builds a public URL from an uploaded path", () => {
    // Switching the field to uploads must not invalidate addresses already
    // pasted in, so both shapes have to resolve.
    expect(imageSrc("pages/offer/abc/1-x.png")).toContain(
      "/storage/v1/object/public/public-media/pages/offer/abc/1-x.png",
    );
  });

  it("returns nothing for an empty or non-string value", () => {
    for (const v of ["", "   ", null, undefined, 42, {}]) expect(imageSrc(v)).toBeNull();
  });
});

describe("layout variants that actually differ", () => {
  it("gives the pricing section real options", () => {
    const v = sectionDef("value")!.variants!;
    expect(v.map((x) => x.key)).toEqual(["compare", "card", "tiers"]);
  });

  it("keeps a default variant for every section that declares them", () => {
    // defaultRows picks variants[0]; a section with an empty list would start
    // on no variant and render its fallback branch forever.
    for (const def of SECTIONS) {
      if (!def.variants) continue;
      expect(def.variants.length, `${def.key} declares an empty variant list`).toBeGreaterThan(1);
    }
  });
});


describe("every part can do the job its definition gives it", () => {
  const has = (key: string, field: string) => sectionDef(key)!.fields.some((f) => f.key === field);

  it("keeps Ajit's own names for the parts", () => {
    // He thinks in these words. Renaming them in the editor makes his own
    // structure harder for him to navigate.
    expect(sectionDef("solution")!.title).toBe("Solution");
    expect(sectionDef("benefits")!.title).toBe("Benefits");
    expect(sectionDef("offer")!.title).toBe("The Offer");
  });

  it("puts a button where the stack ends", () => {
    // "a value stack that piles up everything they get right before the
    // button" — there was no button in section 6 at all.
    expect(has("offer", "stack")).toBe(true);
    expect(has("offer", "ctaLabel")).toBe(true);
  });

  it("puts a button where the price is revealed", () => {
    // Section 9 named the price and gave no way to act on it.
    expect(has("value", "ctaLabel")).toBe(true);
  });

  it("asks for the CTA to repeat down the page, not appear once", () => {
    const withButton = SECTIONS.filter((d) => d.fields.some((f) => f.key === "ctaLabel")).map((d) => d.key);
    expect(withButton).toEqual(["hero", "offer", "value", "cta"]);
  });

  it("keeps the reframe that puts the problem outside their character", () => {
    expect(has("problem", "feels")).toBe(true);
    expect(has("problem", "truth")).toBe(true);
  });

  it("lets proof stand on the mechanism when there are no reviews yet", () => {
    expect(sectionDef("proof")!.variants?.map((v) => v.key)).toContain("mechanism");
  });
});

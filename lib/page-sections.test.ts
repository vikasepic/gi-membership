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
} from "@/lib/page-sections";

describe("the ten sections", () => {
  it("covers Ajit's structure, with the hero carrying parts 1 and 2", () => {
    expect(SECTION_KEYS).toEqual([
      "hero",
      "problem",
      "solution",
      "benefits",
      "offer",
      "authority",
      "proof",
      "value",
      "cta",
    ]);
    // Nine bands, ten named parts — the pre-head cannot have a ground of its
    // own, since it is defined as the line above the headline.
    expect(sectionDef("hero")!.n).toBe("1 + 2");
    expect(sectionDef("cta")!.n).toBe("10");
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
    expect(listOf(v.c.steps, ["title", "body"])).toHaveLength(3);
  });

  it("prefers stored content over the default", () => {
    const v = buildSectionView({ ...row, content: { heading: "Ours" } })!;
    expect(textOf(v.c, "heading")).toBe("Ours");
    // Untouched fields still come through, so a partial edit is not a blank band.
    expect(listOf(v.c.steps, ["title", "body"])).toHaveLength(3);
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

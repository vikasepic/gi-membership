import { describe, it, expect } from "vitest";
import {
  OTO_CONTENT,
  OTO_CONTENT_KEYS,
  contentValue,
  defaultFor,
  paragraphs,
  rows,
  items,
  normalizePageOverrides,
} from "@/lib/oto-content";

describe("oto content schema", () => {
  it("has no duplicate keys", () => {
    expect(new Set(OTO_CONTENT_KEYS).size).toBe(OTO_CONTENT_KEYS.length);
  });

  it("ships a non-empty default for every field", () => {
    // The whole fallback model rests on this: an offer nobody has edited must
    // render the page as written, not a blank section after a payment.
    const empty = OTO_CONTENT.flatMap((g) => g.fields).filter((f) => !f.default.trim());
    expect(empty.map((f) => f.key)).toEqual([]);
  });

  it("keeps every list field parseable into the rows its section expects", () => {
    // A `lines` default with the wrong number of cells would render blanks the
    // moment someone opens the editor and saves without touching it.
    const shapes: Record<string, number> = {
      "hero.card": 3,
      "statbar.items": 2,
      "benefits.cards": 2,
      "means.rows": 2,
      "compare.rows": 4,
      "faq.items": 2,
    };
    for (const [key, cells] of Object.entries(shapes)) {
      for (const row of rows(defaultFor(key), cells)) {
        expect(row.filter(Boolean).length, `${key}: ${row.join(" | ")}`).toBe(cells);
      }
    }
  });
});

describe("contentValue", () => {
  it("returns the default when there is no override", () => {
    expect(contentValue({}, "hero.badge")).toBe(defaultFor("hero.badge"));
  });

  it("returns the override when one is set", () => {
    expect(contentValue({ "hero.badge": "Ends tonight" }, "hero.badge")).toBe("Ends tonight");
  });

  it("falls back rather than throwing on junk", () => {
    // This runs on a page reached only after a payment. Malformed stored data
    // should cost a sentence, never the page.
    for (const junk of [null, undefined, "a string", 42, [], { "hero.badge": 5 }, { "hero.badge": "  " }]) {
      expect(contentValue(junk, "hero.badge")).toBe(defaultFor("hero.badge"));
    }
  });

  it("returns empty for a key nobody declared", () => {
    expect(contentValue({}, "nope.nothing")).toBe("");
  });
});

describe("parsers", () => {
  it("splits paragraphs on blank lines and drops the empties", () => {
    expect(paragraphs("one\n\ntwo\n\n\n  \n\nthree")).toEqual(["one", "two", "three"]);
  });

  it("pads short rows instead of returning undefined cells", () => {
    // A half-typed line must render as a missing cell, not crash the page.
    expect(rows("a | b", 4)).toEqual([["a", "b", "", ""]]);
  });

  it("drops extra cells past the expected count", () => {
    expect(rows("a|b|c", 2)).toEqual([["a", "b"]]);
  });

  it("ignores blank lines in lists", () => {
    expect(items("one\n\n  \ntwo\n")).toEqual(["one", "two"]);
  });
});

describe("normalizePageOverrides", () => {
  const norm = (o: Record<string, string>) =>
    normalizePageOverrides((k) => (k in o ? o[k] : null));

  it("stores a real edit", () => {
    expect(norm({ "hero.badge": "Ends tonight" })).toEqual({ "hero.badge": "Ends tonight" });
  });

  it("drops a value typed back to the shipped copy", () => {
    // Otherwise every offer freezes its copy the first time anyone opens the
    // editor and saves, and a later change to the shipped page reaches nobody.
    expect(norm({ "hero.badge": defaultFor("hero.badge") })).toEqual({});
  });

  it("treats clearing a box as a reset", () => {
    expect(norm({ "hero.badge": "   " })).toEqual({});
  });

  it("ignores keys that are not declared", () => {
    expect(norm({ "evil.key": "x", "hero.badge": "y" })).toEqual({ "hero.badge": "y" });
  });

  it("normalises CRLF so a Windows paste is not stored as a different value", () => {
    const d = defaultFor("problem.chips");
    expect(norm({ "problem.chips": d.replace(/\n/g, "\r\n") })).toEqual({});
  });
});

import { describe, it, expect } from "vitest";
import { CARD_TEMPLATES, applyCardTemplate } from "@/lib/block-controls";
import { newBlock, normalizeBlocks, propsFor, setPropsAt, type Block } from "@/lib/blocks";

// A card template is a shortcut through the settings panel, not an editor of
// its own. Everything below is one claim in different words: it may change how
// the cards look and nothing about what they say.

const ITEMS = [
  { title: "One", body: "First", amount: "£9", icon: "<svg/>", image: "https://x.test/a.png" },
  { title: "Two", body: "Second", amount: "", icon: "", image: "" },
];

const filled = (over: Record<string, unknown> = {}): Block =>
  normalizeBlocks([{ id: "b1", type: "cards", props: { items: ITEMS, ...over } }])[0];

const applied = CARD_TEMPLATES.filter((t) => Object.keys(t.props).length > 0);

describe("what a card template is allowed to touch", () => {
  it("checks every template but the one that is meant to do nothing", () => {
    // `applied` filters on empty props, so a real template shipped with
    // `props: {}` by mistake would be skipped by both tables below while the
    // suite still read as "every template checked".
    expect(CARD_TEMPLATES.filter((t) => !applied.includes(t)).map((t) => t.id)).toEqual(["keep"]);
  });

  it.each(applied.map((t) => t.id))("leaves every card untouched: %s", (id) => {
    // The one thing that must never happen. A chooser people press to see what
    // it does cannot be a chooser that empties the cards, and "it only writes
    // presentation keys" is a claim that has to be checked rather than read.
    const before = filled();
    expect(applyCardTemplate(before, id).props.items).toEqual(ITEMS);
  });

  it.each(applied.map((t) => t.id))("names no content key: %s", (id) => {
    const t = CARD_TEMPLATES.find((x) => x.id === id)!;
    for (const key of ["items", "title", "note", "media", "numbered"]) {
      expect(key in t.props).toBe(false);
    }
  });

  it("only sets keys a cards block actually has", () => {
    // A template writing a key nothing reads is a preset that appears to work.
    const known = Object.keys(newBlock("cards").props);
    for (const t of CARD_TEMPLATES) {
      for (const key of [...Object.keys(t.props), ...Object.values(t.at ?? {}).flatMap(Object.keys)]) {
        expect(known).toContain(key);
      }
    }
  });

  it("freezes no colour", () => {
    // Every colour on a cards block defaults to null so the band paints it. A
    // template that set one would be the single card set on the page that
    // ignores the section it is standing in.
    for (const t of CARD_TEMPLATES) {
      expect(t.props.iconBg ?? null).toBeNull();
      expect(t.props.iconColor ?? null).toBeNull();
    }
  });
});

describe("keeping what you have", () => {
  it("is a choice that changes nothing at all", () => {
    // Present so a row of two previews does not read as "pick one". Pressing it
    // has to be identical to not pressing anything.
    const before = filled({ skin: "tinted", columns: 2 });
    expect(applyCardTemplate(before, "keep")).toEqual(before);
  });

  it("does the same for an id nobody defined", () => {
    const before = filled();
    expect(applyCardTemplate(before, "nonsense")).toEqual(before);
  });
});

describe("the tiles template", () => {
  it("is four across, two on a tablet and one on a phone", () => {
    const b = applyCardTemplate(filled(), "tiles");
    expect(propsFor(b, "desktop").columns).toBe(4);
    expect(propsFor(b, "tablet").columns).toBe(2);
    expect(propsFor(b, "mobile").columns).toBe(1);
  });

  it("sets a boxed card with its own padding, gap and corner", () => {
    const p = applyCardTemplate(filled(), "tiles").props;
    expect(p).toMatchObject({ skin: "boxed", cardPadding: 20, cardGap: 16, cardRadius: 12, divider: false });
    expect(p).toMatchObject({ iconShape: "rounded", iconPlace: "above" });
  });
});

describe("the rows template", () => {
  it("is one column with a rule between and no card box", () => {
    const p = applyCardTemplate(filled(), "rows").props;
    expect(p).toMatchObject({ skin: "plain", columns: 1, divider: true, cardGap: 28, cardPadding: null });
    expect(p).toMatchObject({ iconShape: "circle", iconPlace: "beside" });
  });

  it("takes back the per-device Across the template before it left behind", () => {
    // Rows is one column at every width, so it sets no override — and an
    // override it did not set is one the panel shows as "4 across" while a
    // tablet quietly renders two.
    const b = applyCardTemplate(applyCardTemplate(filled(), "tiles"), "rows");
    expect(propsFor(b, "tablet").columns).toBe(1);
    expect(propsFor(b, "mobile").columns).toBe(1);
    // And the override object goes with it rather than being left empty.
    expect(b.responsive).toBeUndefined();
  });

  it("leaves an override someone set on something else alone", () => {
    // Clearing Across is not licence to clear the block's own responsive style.
    const b = applyCardTemplate(setPropsAt(filled(), "mobile", { numbered: true }), "rows");
    expect(b.responsive?.mobile.props).toEqual({ numbered: true });
  });
});

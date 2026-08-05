import { describe, it, expect } from "vitest";
import { SECTIONS, buildSectionView, defaultRows, sectionDef, type SectionRow } from "@/lib/page-sections";
import { blocksForSection, evenColumns, isUnconverted, sectionToBlocks } from "@/lib/section-to-blocks";
import { normalizeBlocks, walkBlocks, type Block } from "@/lib/blocks";

/** A row of exactly these column widths. Rows are described by widths now. */
const isRow = (b: Block, widths: number[]) =>
  b.type === "row" && JSON.stringify(b.props.widths) === JSON.stringify(widths);

const view = (sectionKey: string, content: Record<string, unknown>) =>
  buildSectionView({ sectionKey, position: 0, enabled: true, style: "paper", accent: null, variant: null, content })!;

const convert = (sectionKey: string, content: Record<string, unknown>) => {
  const v = view(sectionKey, content);
  return sectionToBlocks(v.def, v.c);
};

const types = (blocks: Block[]) => walkBlocks(blocks).map((b) => b.type);
const allText = (blocks: Block[]) =>
  walkBlocks(blocks)
    .map((b) => JSON.stringify(b.props))
    .join(" ");

describe("nothing is invented", () => {
  it("an empty section converts to nothing", () => {
    // Every field blank. The defaults are claim-free, so a page nobody wrote
    // must not become a page of blocks nobody wrote either.
    for (const def of SECTIONS) {
      const blank = Object.fromEntries(def.fields.map((f) => [f.key, f.kind === "list" ? [] : ""]));
      expect(sectionToBlocks(def, blank), def.key).toEqual([]);
    }
  });

  // Straight to the converter: buildSectionView fills defaults, so content
  // that looks empty is not empty by the time a view is built.
  const raw = (key: string, content: Record<string, unknown>) => sectionToBlocks(sectionDef(key)!, content);

  it("an empty field produces no block", () => {
    expect(types(raw("hero", { headline: "Only this", subhead: "", bullets: [], ctaLabel: "" }))).toEqual(["heading"]);
  });

  it("a list of blank rows produces no block", () => {
    expect(raw("benefits", { heading: "", items: [{ title: "", body: "" }] })).toEqual([]);
  });
});

describe("nothing is lost", () => {
  it.each(
    SECTIONS.map((d) => [d.key] as const),
  )("%s: every written value appears in the blocks", (key) => {
    const def = sectionDef(key)!;
    // Fill every field with something identifiable.
    const content: Record<string, unknown> = {};
    const marks: string[] = [];
    for (const f of def.fields) {
      if (f.kind === "list") {
        content[f.key] = [
          Object.fromEntries(
            f.item.map((sub, i) => {
              const v = `${f.key}-${sub.key}-${i}`;
              marks.push(v);
              return [sub.key, v];
            }),
          ),
        ];
      } else if (f.kind === "richtext") {
        content[f.key] = `<p>${f.key}-copy</p>`;
        marks.push(`${f.key}-copy`);
      } else if (f.kind === "image") {
        content[f.key] = `https://x.test/${f.key}.jpg`;
        marks.push(`${f.key}.jpg`);
      } else {
        content[f.key] = `${f.key}-value`;
        marks.push(`${f.key}-value`);
      }
    }
    const text = allText(convert(key, content));
    for (const m of marks) expect(text, `${key} lost ${m}`).toContain(m);
  });
});

describe("each section gets its own layout", () => {
  // Nine sections that all render as heading + lead + three boxed cards is one
  // section repeated nine times. The skin, the numbering and the alignment are
  // what make a page read as a page.
  it("puts the deliverables in a numbered card beside the hero copy", () => {
    // The model page leads with that card. Stacking it under the copy is what
    // left half the band empty.
    const out = convert("hero", { headline: "x", bullets: [{ text: "One" }, { text: "Two" }] });
    const row = out.find((b) => b.type === "row")!;
    // The copy leads and the card supports — the proportion the model uses.
    expect(row.props.widths).toEqual([60, 40]);
    const card = row.columns![1][0];
    expect(card.type).toBe("cards");
    expect(card.props.columns).toBe(1);
    expect(card.props.numbered).toBe(true);
    expect((card.props.items as { title: string }[])[0].title).toBe("One");
  });

  it("keeps the buttons and figures together on the left", () => {
    const out = convert("hero", {
      headline: "x", ctaLabel: "Buy", bullets: [{ text: "One" }],
      stats: [{ value: "7", label: "days" }],
    });
    const left = out.find((b) => b.type === "row")!.columns![0].map((x) => x.type);
    expect(left).toContain("button");
    expect(left).toContain("stats");
  });

  it("stacks the hero when there is nothing to sit beside the copy", () => {
    const out = convert("hero", { headline: "x", bullets: [], facts: [] });
    expect(out.some((b) => b.type === "row")).toBe(false);
    expect(out[0].type).toBe("heading");
  });

  it("opens the how-it-works band as heading beside explanation", () => {
    const out = convert("solution", { heading: "How", lead: "You answer, it writes." });
    expect(out[0].type).toBe("row");
    expect(out[0].columns![0][0].type).toBe("heading");
    expect(out[0].columns![1][0].type).toBe("text");
  });

  it("puts the portrait beside the authority copy", () => {
    const out = convert("authority", { heading: "Why me", body: "Twelve years.", imageUrl: "https://x.test/p.jpg" });
    const row = out.find((b) => b.type === "row")!;
    expect(row.columns![1][0].type).toBe("image");
  });

  it("closes with the checklist beside the price card", () => {
    const out = convert("cta", { heading: "Do not wait", checklist: [{ text: "a" }], ctaLabel: "Buy" });
    const row = out.find((b) => isRow(b, [50, 50]))!;
    expect(row.columns![0].map((x) => x.type)).toEqual(["heading", "iconlist"]);
    const card = row.columns![1][0];
    expect(card.type).toBe("pricecard");
    expect(card.props.ctaLabel).toBe("Buy");
    // Blank, so it shows the offer's real figure rather than a typed one.
    expect(card.props.price).toBe("");
  });

  it("does not give every section the same card treatment", () => {
    const skin = (key: string, content: Record<string, unknown>) =>
      convert(key, content).find((b) => b.type === "cards")!.props;
    const items = [{ title: "a", body: "b" }, { title: "c", body: "d" }];
    const offer = skin("offer", { heading: "x", modules: items });
    const problem = skin("problem", { heading: "x", traps: items });
    const solution = skin("solution", { heading: "x", steps: items });
    const proof = skin("proof", { heading: "x", reasons: items });
    expect(new Set([offer.skin, problem.skin, solution.skin, proof.skin]).size).toBeGreaterThan(2);
    // A sequence gets a numbered circle; a set of alternatives does not.
    expect(solution.numberStyle).toBe("circle");
    expect(proof.numbered).toBe(false);
  });

  it("centres some bands and not others, so the page has a rhythm", () => {
    const align = (key: string) =>
      walkBlocks(convert(key, { heading: "H", headline: "H" })).find((b) => b.type === "heading")!.style.align;
    const centredKeys = ["problem", "benefits", "proof", "value"].map(align);
    const leftKeys = ["hero", "offer", "solution", "authority", "cta"].map(align);
    expect(new Set(centredKeys)).toEqual(new Set(["center"]));
    expect(new Set(leftKeys)).toEqual(new Set(["left"]));
  });
});

describe("the shapes come across", () => {
  it("the hero headline becomes an h1, not a generic heading", () => {
    const out = convert("hero", { headline: "The promise" });
    expect(out[0].type).toBe("heading");
    expect(out[0].props.tag).toBe("h1");
  });

  it("the facts card stays a card, and the figures strip stays a strip", () => {
    const out = convert("hero", {
      headline: "x",
      facts: [{ label: "L", value: "V", detail: "D" }],
      stats: [{ value: "2", label: "Platforms" }],
    });
    // Both are nested in the hero's two-column row: the strip under the
    // buttons on the left, the facts card on the right.
    const stats = walkBlocks(out).filter((b) => b.type === "stats");
    expect(stats.map((b) => b.props.layout).sort()).toEqual(["card", "strip"]);
  });

  it("the value stack becomes a price table with its total", () => {
    const out = convert("offer", {
      heading: "x",
      stack: [{ label: "Part one", amount: "$100" }],
      totalLabel: "Total value",
      totalAmount: "$300",
    });
    const pricing = walkBlocks(out).find((b) => b.type === "pricing")!;
    expect(pricing.props.totalAmount).toBe("$300");
    // A value stack is not a comparison — nothing is "ours" to highlight.
    expect(pricing.props.highlightLast).toBe(false);
  });

  it("the comparison highlights the last row, where yours goes", () => {
    const out = convert("value", { heading: "x", options: [{ label: "Agency", amount: "$2k", note: "" }] });
    expect(out.find((b) => b.type === "pricing")!.props.highlightLast).toBe(true);
  });

  it("questions become an FAQ block, in their own band", () => {
    const out = convert("faq", { heading: "FAQ", faqs: [{ q: "Refunds?", a: "Yes." }] });
    expect(types(out)).toContain("faq");
  });

  it("gives the guarantee a panel of its own", () => {
    // Buried under a price it is a guarantee nobody reads, which is why it was
    // pulled out of section nine.
    const out = convert("guarantee", { heading: "Nothing today", body: "Not charged until day eight.", points: [{ text: "Cancel in one click" }] });
    const panel = out.find((b) => isRow(b, [100]))!;
    expect(panel.style.background.type).toBe("classic");
    expect(panel.columns![0].map((b) => b.type)).toEqual(["heading", "text", "iconlist"]);
  });

  it("renders the footer's links as one line", () => {
    const out = convert("footer", {
      note: "© Greater Inside 2026.",
      links: [{ label: "Privacy", url: "/privacy" }, { label: "Terms", url: "/terms" }],
    });
    const line = out[out.length - 1];
    expect(String(line.props.html)).toContain('href="/privacy"');
    expect(String(line.props.html)).toContain("&middot;");
  });

  it("escapes a footer link, so a label cannot become markup", () => {
    const out = convert("footer", { links: [{ label: "<img src=x onerror=1>", url: "/a" }] });
    expect(String(out[out.length - 1].props.html)).not.toContain("<img");
  });

  it("testimonials become slides, keeping the name and role with the quote", () => {
    const out = convert("proof", { heading: "x", quotes: [{ quote: "It worked", name: "Sam", role: "Coach" }] });
    const slides = out.find((b) => b.type === "slides")!;
    expect(slides.props.items).toEqual([{ quote: "It worked", name: "Sam", role: "Coach" }]);
  });

  it("card grids stay a grid of cards, keeping the box and the columns", () => {
    // Decomposing these into heading + text lost the design and made the page
    // read as flat prose. One cards block carries the box, the columns and the
    // numbering, and can still be rearranged as a unit.
    const out = convert("benefits", {
      heading: "x",
      items: [
        { title: "One", body: "a" },
        { title: "Two", body: "b" },
        { title: "Three", body: "c" },
      ],
    });
    const cards = out.find((b) => b.type === "cards")!;
    expect(cards.props.columns).toBe(3);
    expect(cards.props.skin).toBe("tinted");
    expect(cards.style.width).toBe("full");
    expect(cards.props.items).toHaveLength(3);
  });

  it("numbers a sequence, and does not number what is not one", () => {
    const steps = convert("solution", { heading: "x", steps: [{ title: "First", body: "a" }, { title: "Second", body: "b" }] });
    expect(steps.find((b) => b.type === "cards")!.props.numbered).toBe(true);
    const outcomes = convert("benefits", { heading: "x", items: [{ title: "First", body: "a" }, { title: "Second", body: "b" }] });
    expect(outcomes.find((b) => b.type === "cards")!.props.numbered).toBe(false);
  });

  it("keeps the quote marks the problem chips used to get from the renderer", () => {
    const out = convert("problem", { heading: "x", chips: [{ text: "I never know what to say" }] });
    expect(allText(out)).toContain("“I never know what to say”");
  });

  it("closes the problem section with the story then the reframe, weighted", () => {
    // Side by side gave equal weight to the thing that is wrong and the thing
    // that is right, which is the opposite of the point.
    const out = convert("problem", { heading: "x", feels: "Not disciplined", truth: "Nobody showed you" });
    expect(out.some((b) => b.type === "row")).toBe(false);
    const text = allText(out);
    expect(text).toContain("<em>Not disciplined</em>");
    expect(text).toContain("<strong>Nobody showed you</strong>");
    expect(text.indexOf("Not disciplined")).toBeLessThan(text.indexOf("Nobody showed you"));
  });

  it("a single card is one column wide, not a third of the page", () => {
    const out = convert("benefits", { heading: "x", items: [{ title: "Only", body: "one" }] });
    expect(out.find((b) => b.type === "cards")!.props.columns).toBe(1);
  });

  it("sets the checkout details against the price card", () => {
    const out = convert("value", {
      heading: "x",
      checklist: [{ text: "Included" }],
      priceNote: "Cancel any time",
      ctaLabel: "Start now",
    });
    const row = out.find((b) => isRow(b, [50, 50]))!;
    expect(row.columns![0].map((x) => x.type)).toEqual(["iconlist", "text"]);
    expect(row.columns![1][0].type).toBe("pricecard");
  });

  it("wraps the checkout details in a box when there is no price card", () => {
    const out = convert("value", { heading: "x", checklist: [{ text: "Included" }] });
    const box = out.find((b) => isRow(b, [100]))!;
    expect(box.style.background.type).toBe("classic");
    expect(box.style.background.color).toBeNull();
  });

  it("escapes text so a stray angle bracket cannot become markup", () => {
    const out = convert("hero", { headline: "x", subhead: "<script>alert(1)</script>" });
    expect(allText(out)).not.toContain("<script>");
    expect(allText(out)).toContain("&lt;script&gt;");
  });

  it("keeps the Copy field's formatting, and puts it last", () => {
    const out = convert("benefits", { heading: "Head", copy: "<p>Formatted <strong>copy</strong></p>" });
    expect(String(out[out.length - 1].props.html)).toContain("<strong>copy</strong>");
  });

  it("ignores a Copy field holding only empty markup", () => {
    expect(convert("benefits", { heading: "Head", copy: "<p></p>" })).toHaveLength(1);
  });
});

describe("what it produces is a real block tree", () => {
  it.each(SECTIONS.map((d) => [d.key] as const))("%s survives normalizeBlocks unchanged", (key) => {
    const def = sectionDef(key)!;
    const content: Record<string, unknown> = {};
    for (const f of def.fields) {
      content[f.key] =
        f.kind === "list"
          ? [Object.fromEntries(f.item.map((s) => [s.key, `${s.key} value`]))]
          : f.kind === "richtext"
            ? "<p>copy</p>"
            : "some value";
    }
    const blocks = convert(key, content);
    expect(normalizeBlocks(JSON.parse(JSON.stringify(blocks)))).toEqual(blocks);
  });

  it("gives every block a unique id, including nested ones", () => {
    const out = convert("benefits", {
      heading: "x",
      items: [{ title: "a", body: "b" }, { title: "c", body: "d" }],
    });
    const ids = walkBlocks(out).map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("blocksForSection", () => {
  const row = (content: Record<string, unknown>): SectionRow => ({
    ...defaultRows().find((r) => r.sectionKey === "benefits")!,
    content,
  });

  it("converts a section that has never been opened in the builder", () => {
    const v = buildSectionView(row({ heading: "From the fields" }))!;
    expect(isUnconverted(v)).toBe(true);
    expect(allText(blocksForSection(v))).toContain("From the fields");
  });

  it("prefers saved blocks once there are any", () => {
    const saved = convert("benefits", { heading: "Saved in the builder" });
    const v = buildSectionView(row({ heading: "The old field", blocks: saved }))!;
    expect(isUnconverted(v)).toBe(false);
    const text = allText(blocksForSection(v));
    expect(text).toContain("Saved in the builder");
    expect(text).not.toContain("The old field");
  });

  it("is non-destructive — the typed content is still there underneath", () => {
    const v = buildSectionView(row({ heading: "Still here", blocks: convert("benefits", { heading: "New" }) }))!;
    expect(v.c.heading).toBe("Still here");
  });
});

describe("the hero matches the model page's shape", () => {
  const hero = (content: Record<string, unknown>) => convert("hero", content);

  it("makes the package one compact card, not a stack of boxes", () => {
    // Six separate boxes down the side of a hero is twice the height of the
    // copy it is meant to sit beside.
    const card = walkBlocks(hero({ headline: "x", bullets: [{ text: "a" }, { text: "b" }] }))
      .find((b) => b.type === "cards")!;
    expect(card.props.skin).toBe("list");
    expect(card.props.columns).toBe(1);
    expect(card.props.numbered).toBe(true);
  });

  it("keeps both buttons adjacent, so the renderer puts them on one line", () => {
    const left = hero({ headline: "x", ctaLabel: "Buy", ctaSecondary: "How it works", bullets: [{ text: "a" }] })
      .find((b) => b.type === "row")!.columns![0];
    const types = left.map((b) => b.type);
    const first = types.indexOf("button");
    expect(types[first + 1]).toBe("button");
    expect(left[first].props.variant).toBe("solid");
    expect(left[first + 1].props.variant).toBe("outline");
  });
});

describe("the package card carries its own title and note", () => {
  it("passes both through to the card", () => {
    const card = walkBlocks(convert("hero", {
      headline: "x",
      bullets: [{ text: "One" }],
      packageTitle: "Your package",
      packageNote: "Voice match: paste 200 words you have already written.",
    })).find((b) => b.type === "cards")!;
    expect(card.props.title).toBe("Your package");
    expect(String(card.props.note)).toContain("Voice match");
  });

  it("leaves them empty when nobody wrote them", () => {
    const card = walkBlocks(convert("hero", { headline: "x", bullets: [{ text: "One" }] }))
      .find((b) => b.type === "cards")!;
    expect(card.props.title).toBe("");
    expect(card.props.note).toBe("");
  });

  it("makes the audience line a chip that hugs its text", () => {
    const chip = convert("hero", { headline: "x", audience: "Built for: Coaches" })
      .find((b) => b.type === "text" && b.style.width === "fit");
    expect(chip).toBeTruthy();
  });
});

describe("the problem cards match the model", () => {
  it("are tinted with the number before the title", () => {
    const cards = convert("problem", {
      heading: "x",
      traps: [{ title: "The blank page", body: "a" }, { title: "The burst", body: "b" }],
    }).find((b) => b.type === "cards")!;
    expect(cards.props.skin).toBe("tinted");
    expect(cards.props.numberStyle).toBe("inline");
    expect(cards.props.numbered).toBe(true);
  });
});

describe("evenColumns", () => {
  it("never leaves a short last row when it can be avoided", () => {
    // Six cards at four across is a row of four and a row of two, which reads
    // as a mistake rather than a layout.
    expect(evenColumns(6)).toBe(3);
    expect(evenColumns(4)).toBe(4);
    expect(evenColumns(3)).toBe(3);
    expect(evenColumns(2)).toBe(2);
    expect(evenColumns(1)).toBe(1);
    expect(evenColumns(8)).toBe(4);
    expect(evenColumns(9)).toBe(3);
  });

  it("divides evenly wherever it claims to", () => {
    for (let n = 1; n <= 12; n++) {
      const cols = evenColumns(n);
      expect(cols).toBeGreaterThanOrEqual(1);
      expect(cols).toBeLessThanOrEqual(4);
      if (n % cols !== 0) expect(n % 3).not.toBe(0);
    }
  });

  it("lays six outcomes out three across", () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ title: `T${i}`, body: "b" }));
    expect(convert("benefits", { heading: "x", items }).find((b) => b.type === "cards")!.props.columns).toBe(3);
  });
});

describe("the authority band", () => {
  it("keeps a headline to a measure when there is no portrait beside it", () => {
    // Full width across a 1040px band is far too long a line for a headline
    // this size — it was running edge to edge.
    const out = convert("authority", { heading: "Built by people who study what performs", body: "Some copy." });
    expect(out.some((b) => b.type === "row")).toBe(false);
    for (const b of out) expect(b.style.width).not.toBe("full");
  });

  it("puts the portrait beside the copy when there is one", () => {
    const out = convert("authority", { heading: "H", body: "B", imageUrl: "https://x.test/p.jpg" });
    const row = out.find((b) => b.type === "row")!;
    expect(row.columns![1][0].type).toBe("image");
    expect(row.columns![0][0].style.width).toBe("full");
  });

  it("puts the logos in their own panel, with the label", () => {
    const out = convert("authority", {
      heading: "H", body: "B",
      logosLabel: "Companies I have built for",
      logos: [{ name: "Mindvalley", url: "https://x.test/mv.svg" }, { name: "Evercoach", url: "https://x.test/ec.svg" }],
    });
    const panel = walkBlocks(out).find((b) => isRow(b, [100]))!;
    expect(panel.style.background.type).toBe("classic");
    const inside = panel.columns![0].map((b) => b.type);
    expect(inside).toEqual(["text", "cards"]);
    const logoCards = panel.columns![0][1];
    expect((logoCards.props.items as { icon: string }[])[0].icon).toBe("https://x.test/mv.svg");
  });

  it("shows no panel when there are no logos", () => {
    const out = convert("authority", { heading: "H", body: "B" });
    expect(walkBlocks(out).some((b) => b.type === "cards")).toBe(false);
  });
});

describe("a section nobody has written opens empty", () => {
  const view = (content: Record<string, unknown>) =>
    buildSectionView({
      sectionKey: "hero", position: 0, enabled: true,
      style: "navy", accent: null, variant: null, content,
    })!;

  it("converts nothing when nothing was stored", () => {
    // The defaults are guidance, not content. Converting them handed someone a
    // canvas full of placeholder prose to delete before they could start —
    // "The outcome they want, in one line." is not anybody's headline.
    expect(blocksForSection(view({}))).toEqual([]);
  });

  it("still shows the defaults where the page renders typed fields", () => {
    // buildSectionView keeps merging them, because a section saved before the
    // builder existed still renders through the typed components.
    expect(view({}).c.headline).toBe(sectionDef("hero")!.defaults.headline);
    expect(view({}).stored.headline).toBeUndefined();
  });

  it("converts what was actually written", () => {
    const out = blocksForSection(view({ headline: "Write viral carousels" }));
    expect(out).toHaveLength(1);
    expect(out[0].props.text).toBe("Write viral carousels");
  });

  it("does not smuggle a default in beside real content", () => {
    const out = blocksForSection(view({ headline: "Mine" }));
    expect(JSON.stringify(out)).not.toContain("Get instant access");
  });
});

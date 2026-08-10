import { describe, it, expect } from "vitest";
import { BLOCK_TYPES, newBlock, normalizeBlocks, type Block, type BlockType } from "@/lib/blocks";
import {
  ADVANCED_CONTROLS,
  BLOCK_CONTROLS,
  BLOCK_LABEL,
  PALETTE,
  controlsFor,
  isGroup,
  readControl,
  scopeOf,
  writeControl,
  type Control,
} from "@/lib/block-controls";

const all = (type: BlockType): Control[] => [
  ...BLOCK_CONTROLS[type].content,
  ...BLOCK_CONTROLS[type].style,
  ...ADVANCED_CONTROLS,
];

const editable = (list: Control[]) => list.filter((c) => !isGroup(c));

describe("every block type is covered", () => {
  it("has controls", () => {
    for (const t of BLOCK_TYPES) expect(BLOCK_CONTROLS[t]).toBeTruthy();
  });

  it("is offered in the palette", () => {
    expect([...new Set(PALETTE.map((p) => p.type))].sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it("is offered more than once only where the second entry presets something", () => {
    // "Buy button" and "Button" are the same block with a different starting
    // action. A repeat with no preset would just be the same thing twice.
    const seen = new Set<string>();
    for (const p of PALETTE) {
      if (seen.has(p.type)) expect(p.props, p.label).toBeTruthy();
      seen.add(p.type);
    }
  });

  it("presets only keys the block actually has", () => {
    // A preset writing a key nothing reads is a control that appears to work.
    for (const p of PALETTE.filter((x) => x.props)) {
      const block = newBlock(p.type);
      for (const key of Object.keys(p.props!)) {
        expect(key in block.props, `${p.label}.${key}`).toBe(true);
      }
    }
  });

  it("has a human label", () => {
    for (const t of BLOCK_TYPES) {
      expect(BLOCK_LABEL[t]).toBeTruthy();
      expect(BLOCK_LABEL[t]).not.toBe(t === "row" ? "row" : "");
    }
  });
});

describe("a control writes somewhere that is actually read", () => {
  // The failure this catches: a control bound to a key nothing renders. It
  // looks like it works — you drag the slider, the value saves — and the page
  // never changes.
  it.each(BLOCK_TYPES)("%s: every key exists on the block it edits", (type) => {
    const block = newBlock(type);
    for (const c of editable(all(type))) {
      // `columns` changes the block's shape rather than one of its values —
      // there is no key for it, and writeControl routes it to setColumnCount.
      if (c.kind === "columns") continue;
      const root = scopeOf(c) === "style" ? (block.style as unknown as Record<string, unknown>) : block.props;
      const head = c.key.split(".")[0];
      expect(head in root, `${type}.${scopeOf(c)}.${c.key}`).toBe(true);
    }
  });

  it("the columns control really restructures the row", () => {
    const control = all("row").find((c) => !isGroup(c) && c.kind === "columns")!;
    const before = newBlock("row");
    const after = writeControl(before, control, 4);
    expect(after.columns).toHaveLength(4);
  });

  it.each(BLOCK_TYPES)("%s: no key appears twice in one tab", (type) => {
    for (const list of [BLOCK_CONTROLS[type].content, BLOCK_CONTROLS[type].style]) {
      const keys = editable(list).map((c) => `${scopeOf(c)}:${c.key}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("advanced controls do not collide with each other", () => {
    const keys = editable(ADVANCED_CONTROLS).map((c) => `${scopeOf(c)}:${c.key}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every select offers the value the block starts with", () => {
    for (const type of BLOCK_TYPES) {
      const block = newBlock(type);
      for (const c of all(type)) {
        if (isGroup(c) || c.kind !== "select") continue;
        const current = readControl(block, c);
        if (current === null || current === undefined) continue;
        expect(
          c.options.map(([v]) => v),
          `${type}.${c.key} = ${String(current)}`,
        ).toContain(String(current));
      }
    }
  });
});

describe("block position is one control, not two", () => {
  // It was two entries on the same style.blockAlign — "Align" on the button's
  // Style tab with a fullWidth guard, "Block position" under Advanced with
  // none — so a full-width button lost it in one tab and kept it in the other,
  // where an auto margin has no free space to take.
  const find = (b: Block, tab: "style" | "advanced") =>
    controlsFor(b)[tab].find((c) => !isGroup(c) && c.key === "blockAlign");

  it("is offered on the button itself and under Advanced, under one label", () => {
    const b = newBlock("button", { props: { text: "x" } });
    expect(find(b, "style")).toBeTruthy();
    expect(find(b, "advanced")).toBeTruthy();
    expect((find(b, "style") as { label: string }).label).toBe(
      (find(b, "advanced") as { label: string }).label,
    );
  });

  it("disappears from BOTH tabs once the button fills the row", () => {
    const full = newBlock("button", { props: { text: "x", fullWidth: true } });
    expect(find(full, "style")).toBeUndefined();
    expect(find(full, "advanced")).toBeUndefined();
  });

  it("stays under Advanced for everything that is not a button", () => {
    for (const t of BLOCK_TYPES) {
      if (t === "button") continue;
      expect(find(newBlock(t), "advanced"), t).toBeTruthy();
    }
  });
});

describe("controlsFor hides what does not apply", () => {
  it("hides the classic background controls until Classic is chosen", () => {
    const b = newBlock("text");
    expect(controlsFor(b).advanced.some((c) => !isGroup(c) && c.key === "background.image")).toBe(false);
    b.style.background.type = "classic";
    expect(controlsFor(b).advanced.some((c) => !isGroup(c) && c.key === "background.image")).toBe(true);
  });

  it("swaps to the gradient controls, never showing both", () => {
    const b = newBlock("text");
    b.style.background.type = "gradient";
    const keys = controlsFor(b).advanced.filter((c) => !isGroup(c)).map((c) => (c as { key: string }).key);
    expect(keys).toContain("background.from");
    expect(keys).not.toContain("background.image");
  });

  it("hides the angle for a radial gradient, which has none", () => {
    const b = newBlock("text");
    b.style.background.type = "gradient";
    b.style.background.shape = "radial";
    const keys = controlsFor(b).advanced.filter((c) => !isGroup(c)).map((c) => (c as { key: string }).key);
    expect(keys).not.toContain("background.angle");
  });

  it("hides the corner radius until there is a background to round", () => {
    const b = newBlock("text");
    const has = (bl: Block) => controlsFor(bl).advanced.some((c) => !isGroup(c) && c.key === "radius");
    expect(has(b)).toBe(false);
    b.style.background.type = "classic";
    expect(has(b)).toBe(true);
  });
});

describe("readControl and writeControl", () => {
  const byKey = (type: BlockType, key: string): Control =>
    all(type).find((c) => !isGroup(c) && (c as { key: string }).key === key)!;

  it("reads a plain prop", () => {
    expect(readControl(newBlock("heading"), byKey("heading", "tag"))).toBe("h2");
  });

  it("reads a style value", () => {
    expect(readControl(newBlock("text"), byKey("text", "color"))).toBeNull();
  });

  it("reads through a dotted path", () => {
    expect(readControl(newBlock("text"), byKey("text", "background.type"))).toBe("none");
  });

  it("writes a plain prop without touching the rest", () => {
    const b = newBlock("heading");
    const next = writeControl(b, byKey("heading", "tag"), "h3");
    expect(next.props.tag).toBe("h3");
    expect(next.props.text).toBe(b.props.text);
  });

  it("writes through a dotted path", () => {
    const b = newBlock("text");
    const next = writeControl(b, byKey("text", "background.type"), "classic");
    expect(next.style.background.type).toBe("classic");
    expect(next.style.background.size).toBe("cover");
  });

  it("does not mutate the block it was given", () => {
    const b = newBlock("text");
    writeControl(b, byKey("text", "background.type"), "gradient");
    expect(b.style.background.type).toBe("none");
  });

  it("writes null back, so a colour can be returned to the band", () => {
    // Clearing an override has to be possible, or the first colour someone
    // picks is permanent and the band can never repaint that block again.
    const b = writeControl(newBlock("heading"), byKey("heading", "color"), "#123456");
    expect(b.style.color).toBe("#123456");
    const cleared = writeControl(b, byKey("heading", "color"), null);
    expect(cleared.style.color).toBeNull();
  });

  it("what it writes survives being stored and read back", () => {
    let b = newBlock("heading");
    b = writeControl(b, byKey("heading", "tag"), "h1");
    b = writeControl(b, byKey("heading", "color"), "#b0532f");
    b = writeControl(b, byKey("heading", "background.type"), "classic");
    const round = normalizeBlocks(JSON.parse(JSON.stringify([b])))[0];
    expect(round.props.tag).toBe("h1");
    expect(round.style.color).toBe("#b0532f");
    expect(round.style.background.type).toBe("classic");
  });

  it("a value the normalizer would reject does not survive, and that is the point", () => {
    // The editor is not the last line of defence — writeControl will store
    // anything, and normalizeBlocks decides what is allowed to come back.
    const b = writeControl(newBlock("heading"), byKey("heading", "color"), "red;background:url(x)");
    expect(normalizeBlocks(JSON.parse(JSON.stringify([b])))[0].style.color).toBeNull();
  });
});

describe("the tabs a block shows", () => {
  it("gives every block an Advanced tab", () => {
    for (const t of BLOCK_TYPES) expect(controlsFor(newBlock(t)).advanced.length).toBeGreaterThan(0);
  });

  it("gives a spacer no style controls, because it has no look of its own", () => {
    expect(controlsFor(newBlock("spacer")).style).toEqual([]);
  });

  it("gives every block at least one thing to edit in Content", () => {
    for (const t of BLOCK_TYPES) {
      expect(editable(controlsFor(newBlock(t)).content).length, t).toBeGreaterThan(0);
    }
  });

  it("offers the heading its tag, which is the control that looked broken before", () => {
    const keys = controlsFor(newBlock("heading")).content.map((c) => (c as { key: string }).key);
    expect(keys).toContain("tag");
  });

  it("warns in the HTML block's own hint that scripts are removed", () => {
    const c = BLOCK_CONTROLS.html.content.find((x) => !isGroup(x) && x.key === "code")!;
    expect((c as { hint?: string }).hint).toMatch(/script/i);
  });

  it("asks for alt text on an image, next to the image", () => {
    const keys = BLOCK_CONTROLS.image.content.map((c) => (c as { key: string }).key);
    expect(keys).toContain("alt");
    expect(keys.indexOf("alt")).toBeLessThan(keys.indexOf("caption"));
  });
});

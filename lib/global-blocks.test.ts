import { describe, it, expect } from "vitest";
import { newBlock, normalizeBlocks, walkBlocks, type Block } from "@/lib/blocks";
import { sanitizeSectionContent } from "@/lib/sanitize-html";
import { expandGlobals, globalIdsIn, globalIdOf } from "@/lib/section-to-blocks";

// A global block is a pointer. The page stores the pointer; the render step
// replaces it with what it points at. Everything below is about that seam,
// because getting it wrong breaks every link on the site at once.

const heading = (text: string): Block => {
  const b = newBlock("heading");
  return { ...b, props: { ...b.props, text } };
};

const pointer = (globalId: string): Block => {
  const b = newBlock("global");
  return { ...b, props: { ...b.props, globalId } };
};

const rowWith = (blocks: Block[]): Block => {
  const r = newBlock("row");
  r.columns![0] = blocks;
  return r;
};

/** Save the way the server action does, then read the way the page does. */
const roundTrip = (blocks: Block[]) =>
  normalizeBlocks(sanitizeSectionContent({ blocks }).blocks);

describe("the pointer itself", () => {
  it("survives the save unchanged", () => {
    // If a save rewrote or dropped this, every link on the site would break at
    // once — and silently, because the page would still render.
    const out = roundTrip([pointer("abc-123")]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("global");
    expect(out[0].props.globalId).toBe("abc-123");
  });

  it("is stable — saving the same page twice changes nothing", () => {
    const once = roundTrip([heading("Above"), pointer("abc-123")]);
    expect(roundTrip(once)).toEqual(once);
  });

  it("is read as pointing nowhere when the id is missing or blank", () => {
    expect(globalIdOf(pointer(""))).toBeNull();
    expect(globalIdOf(pointer("   "))).toBeNull();
    expect(globalIdOf(heading("not a pointer"))).toBeNull();
  });
});

describe("finding what a page points at", () => {
  it("sees a pointer inside a row's column", () => {
    // The reason the delete guard walks the tree instead of asking Postgres
    // for containment: a pointer nested in a column is invisible to a
    // top-level `@>` match, and the guard would have deleted something three
    // live pages were using.
    const ids = globalIdsIn([heading("x"), rowWith([pointer("deep-1")])]);
    expect(ids).toEqual(["deep-1"]);
  });

  it("lists each id once, however many times it appears", () => {
    expect(globalIdsIn([pointer("a"), pointer("a"), pointer("b")])).toEqual(["a", "b"]);
  });
});

describe("expanding at render", () => {
  const cta = [heading("One real copy")];

  it("expands nothing when no map is given", () => {
    // Every existing caller passes no map. The builder wants this too: it
    // draws the pointer itself, as a linked card.
    const blocks = [pointer("a")];
    expect(expandGlobals(blocks)).toEqual(blocks);
  });

  it("replaces the pointer with what it names", () => {
    const out = expandGlobals([pointer("a")], new Map([["a", cta]]));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("heading");
    expect(out[0].props.text).toBe("One real copy");
  });

  it("keeps the blocks around it where they were", () => {
    const out = expandGlobals(
      [heading("before"), pointer("a"), heading("after")],
      new Map([["a", cta]]),
    );
    expect(out.map((b) => b.props.text)).toEqual(["before", "One real copy", "after"]);
  });

  it("expands a pointer nested in a column", () => {
    const out = expandGlobals([rowWith([pointer("a")])], new Map([["a", cta]]));
    expect(out[0].columns![0][0].props.text).toBe("One real copy");
  });

  it("leaves nothing behind when the design is gone", () => {
    // A design deleted out from under a page makes the page shorter, never
    // broken, and never a gap where a block used to be.
    const out = expandGlobals([heading("kept"), pointer("missing")], new Map([["a", cta]]));
    expect(out).toHaveLength(1);
    expect(out[0].props.text).toBe("kept");
  });

  it("gives every copy its own ids", () => {
    // The same design twice on one page would otherwise put a duplicate id in
    // the DOM, and then selecting or deleting either finds only the first.
    const out = expandGlobals([pointer("a"), pointer("a")], new Map([["a", cta]]));
    const ids = walkBlocks(out).map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("expands one level only", () => {
    // A design containing a pointer leaves that pointer alone, which renders
    // nothing — a bounded answer rather than a recursion a cycle could take
    // the page down with.
    const out = expandGlobals([pointer("outer")], new Map([["outer", [pointer("inner")]]]));
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("global");
    expect(out[0].props.globalId).toBe("inner");
  });

  it("survives a design that points at itself", () => {
    const out = expandGlobals([pointer("self")], new Map([["self", [pointer("self")]]]));
    expect(out[0].type).toBe("global");
  });
});

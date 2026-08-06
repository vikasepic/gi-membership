import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockTree } from "@/components/admin/block-tree";
import { newBlock, setColumnWidth } from "@/lib/blocks";
import { sections, asSegment, groupedPalette, PALETTE, BLOCK_ICON } from "@/lib/block-controls";
import { BLOCK_TYPES } from "@/lib/blocks";
import { controlsFor } from "@/lib/block-controls";

// The panel's shape, not its behaviour: every control still writes exactly what
// it wrote before. What changed is how much of it you can see at once.

describe("sections", () => {
  it("splits a tab on its group markers", () => {
    const style = controlsFor(newBlock("button")).style;
    const out = sections(style);
    expect(out.length).toBeGreaterThan(1);
    expect(out.map((s) => s.title)).toContain("Colour");
  });

  it("gives anything before the first marker its own opening section", () => {
    const out = sections(controlsFor(newBlock("image")).content);
    expect(out[0].title).toBeNull();
  });

  it("drops a marker with nothing under it", () => {
    // A section that opens onto nothing is one you open once and never again.
    for (const s of sections(controlsFor(newBlock("heading")).style)) {
      expect(s.controls.length).toBeGreaterThan(0);
    }
  });

  it("loses no control on the way through", () => {
    for (const t of BLOCK_TYPES) {
      const b = newBlock(t);
      for (const tab of ["content", "style", "advanced"] as const) {
        const flat = controlsFor(b)[tab].filter((c) => !("label" in c && !("key" in c)));
        const grouped = sections(controlsFor(b)[tab]).flatMap((s) => s.controls);
        expect(grouped.length, `${t}/${tab}`).toBe(flat.length);
      }
    }
  });
});

describe("which selects become buttons", () => {
  it("shows a short list as buttons", () => {
    const align = controlsFor(newBlock("button")).style.find((c) => "key" in c && c.key === "align");
    expect(align && asSegment(align)).toBe(true);
  });

  it("leaves a long list as a dropdown", () => {
    // Five widths as five buttons is five buttons nobody can read.
    const width = controlsFor(newBlock("heading")).advanced.find((c) => "key" in c && c.key === "width");
    expect(width && asSegment(width)).toBe(false);
  });
});

describe("the palette", () => {
  it("groups every block type somewhere", () => {
    // A type added to PALETTE and forgotten here would be invisible.
    const shown = groupedPalette().flatMap((g) => g.items.map((i) => i.label));
    for (const p of PALETTE) expect(shown, p.label).toContain(p.label);
  });

  it("has an icon for every type", () => {
    for (const t of BLOCK_TYPES) expect(BLOCK_ICON[t], t).toBeTruthy();
  });

  it("searches by name", () => {
    const hits = groupedPalette("pri").flatMap((g) => g.items.map((i) => i.label));
    expect(hits).toContain("Price card");
    expect(hits).not.toContain("Heading");
  });

  it("says nothing rather than everything when nothing matches", () => {
    expect(groupedPalette("zzzz")).toHaveLength(0);
  });
});

describe("the structure tree", () => {
  const tree = (blocks: Parameters<typeof BlockTree>[0]["blocks"], device: "desktop" | "mobile" = "desktop") =>
    renderToStaticMarkup(
      <BlockTree blocks={blocks} selectedId={null} device={device} onSelect={() => {}} />,
    );

  it("lists what is on the page", () => {
    const out = tree([newBlock("heading"), newBlock("image")]);
    expect(out).toContain("Heading");
    expect(out).toContain("Image");
  });

  it("shows what is nested inside a column", () => {
    // Two nested columns look identical on the canvas.
    const row = newBlock("row");
    row.columns = [[newBlock("heading")], []];
    expect(tree([row])).toContain("Heading");
  });

  it("names an empty column instead of showing nothing", () => {
    const row = newBlock("row");
    row.columns = [[], []];
    expect(tree([row])).toContain("Column 1 — empty");
  });

  it("marks a block hidden at the width being edited", () => {
    // The one thing the canvas cannot show: it is not drawn there at all.
    const b = newBlock("heading", { props: { text: "Hi", tag: "h2" } });
    b.style = { ...b.style, hideMobile: true };
    expect(tree([b], "mobile")).toContain("hidden");
    expect(tree([b], "desktop")).not.toContain(">hidden<");
  });

  it("marks a block that renders nothing", () => {
    // Nothing to click on the canvas, because nothing is drawn.
    expect(tree([newBlock("heading", { props: { text: "", tag: "h2" } })])).toContain("empty");
  });

  it("says so when the page is empty", () => {
    expect(tree([])).toContain("Nothing on the page yet");
  });
});

describe("column widths still add up", () => {
  it("takes the difference from the others", () => {
    // Untouched by the redesign, and the thing most easily broken by it.
    const out = setColumnWidth([50, 50], 0, 70);
    expect(Math.round(out.reduce((a, b) => a + b, 0))).toBe(100);
  });
});

describe("the caret rule stays where it belongs", () => {
  it("does not reach every details element on the site", async () => {
    // FAQ blocks on live sales pages are <details> too. An unscoped
    // `details > summary` rule would have quietly rotated the first span in
    // every one of them.
    const css = await import("node:fs").then((fs) => fs.readFileSync("app/globals.css", "utf8"));
    expect(css).not.toMatch(/^details\s*>\s*summary/m);
    expect(css).toContain(".insp-section > summary");
  });
});

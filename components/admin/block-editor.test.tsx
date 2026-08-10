import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockEditor, ImageControl } from "@/components/admin/block-editor";
import { bandTheme } from "@/lib/page-sections";
import { PALETTE, BLOCK_LABEL } from "@/lib/block-controls";
import { addTarget, edgeIndex, insertBlock, moveBlock, newBlock, type Block } from "@/lib/blocks";
import { PREVIEW_SCOPE, normalizeSiteTypography } from "@/lib/site-typography";

const navy = bandTheme("navy");

const shell = (blocks: Block[]) =>
  renderToStaticMarkup(
    <BlockEditor blocks={blocks} theme={navy} title="Hero" onChange={() => {}} onClose={() => {}} />,
  );

describe("the builder shell", () => {
  it("renders with an empty canvas without throwing", () => {
    expect(() => shell([])).not.toThrow();
  });

  it("offers every block in the palette", () => {
    const out = shell([]);
    for (const p of PALETTE) expect(out).toContain(p.label);
  });

  it("tells you what to do when the canvas is empty", () => {
    expect(shell([])).toContain("Drag a block here");
  });

  it("prompts you to pick something before showing an inspector", () => {
    expect(shell([])).toContain("Select a block to edit it.");
  });

  it("renders the canvas on the section's own band, not on white", () => {
    // The whole point of resolving colours against the band is lost if you
    // build on a white canvas and only see the truth after saving.
    expect(shell([])).toContain(navy.bg);
  });

  it("renders real blocks, using the same component the live page uses", () => {
    const b = newBlock("heading");
    const out = shell([{ ...b, props: { ...b.props, text: "The actual words" } }]);
    expect(out).toContain("The actual words");
  });

  it("labels an unfilled block instead of showing an invisible gap", () => {
    const out = shell([newBlock("image")]);
    expect(out).toContain("will not show on the page");
  });

  it("gives each block a drag handle rather than dragging the body", () => {
    const out = shell([newBlock("heading")]);
    expect(out).toContain(`Move ${BLOCK_LABEL.heading}`);
    expect(out).toContain('draggable="true"');
  });

  it("draws a drop area inside every column of a row", () => {
    const out = shell([newBlock("row")]);
    expect(out.match(/Drop here/g)).toHaveLength(2);
  });

  it("counts what is on the canvas", () => {
    expect(shell([newBlock("heading"), newBlock("text")])).toContain("2 blocks");
    expect(shell([newBlock("heading")])).toContain("1 block");
  });
});

describe("edgeIndex — which side of a block a drop lands on", () => {
  // A block from y=100 to y=200, sitting at index 3.
  const above = (y: number) => edgeIndex(y, 100, 100, 3);

  it("puts a drop in the top half before the block", () => {
    expect(above(101)).toBe(3);
    expect(above(149)).toBe(3);
  });

  it("puts a drop in the bottom half after it", () => {
    expect(above(151)).toBe(4);
    expect(above(199)).toBe(4);
  });

  it("treats the exact midpoint as below, so there is no dead band", () => {
    expect(above(150)).toBe(4);
  });

  it("works for the first block, where before means index zero", () => {
    expect(edgeIndex(10, 0, 100, 0)).toBe(0);
    expect(edgeIndex(90, 0, 100, 0)).toBe(1);
  });
});

describe("addTarget — where clicking the palette puts a block", () => {
  const a = newBlock("heading");
  const b = newBlock("text");

  it("appends when nothing is selected", () => {
    expect(addTarget([a, b], null, "button")).toEqual({ zone: "root", index: 2 });
  });

  it("puts it directly after the selection, not at the bottom", () => {
    // The prototype added at the end, so building a page meant adding a block
    // then dragging it back up every single time.
    expect(addTarget([a, b], a.id, "button")).toEqual({ zone: "root", index: 1 });
  });

  it("adds into the same column when something in a column is selected", () => {
    const row = newBlock("row");
    row.columns![1] = [b];
    expect(addTarget([row], b.id, "button")).toEqual({
      zone: "column",
      rowId: row.id,
      column: 1,
      index: 1,
    });
  });

  it("sends a row to the canvas rather than nowhere, when a nested block is selected", () => {
    // A row cannot nest inside a column, so targeting one would drop it
    // silently — the click would look broken.
    const row = newBlock("row");
    row.columns![0] = [b];
    expect(addTarget([row], b.id, "row")).toEqual({ zone: "root", index: 1 });
  });

  it("appends when the selected block has since been deleted", () => {
    expect(addTarget([a], "gone", "text")).toEqual({ zone: "root", index: 1 });
  });

  it("adds into the column itself when the COLUMN is what is selected", () => {
    // A column is not a block, so findBlock cannot see its id — and the click
    // fell through to the bottom of the section. Selecting an empty column and
    // reaching for the palette is the commonest thing anyone does next.
    const row = newBlock("row");
    row.columns![1] = [b];
    expect(addTarget([row], `${row.id}#1`, "button")).toEqual({
      zone: "column",
      rowId: row.id,
      column: 1,
      index: 1,
    });
    expect(addTarget([row], `${row.id}#0`, "button")).toMatchObject({ column: 0, index: 0 });
  });

  it("still sends a row to the canvas when a column is selected", () => {
    const row = newBlock("row");
    expect(addTarget([row], `${row.id}#0`, "row")).toEqual({ zone: "root", index: 1 });
  });

  it("appends when the selected column belongs to a row that is gone", () => {
    expect(addTarget([a], "vanished#0", "text")).toEqual({ zone: "root", index: 1 });
  });

  it("the target it returns is one insertBlock actually honours", () => {
    // The two have to agree, or the block goes somewhere other than where the
    // editor just told the user it would.
    const row = newBlock("row");
    row.columns![0] = [b];
    const tree = [row];
    const added = newBlock("button");
    const out = insertBlock(tree, added, addTarget(tree, b.id, "button"));
    expect(out[0].columns![0].map((x) => x.id)).toEqual([b.id, added.id]);
  });
});

describe("dragging a block that is already on the canvas", () => {
  it("dropped on the top half of the third block, it lands between the second and third", () => {
    const [a, b, c] = [newBlock("heading"), newBlock("text"), newBlock("button")];
    // c occupies y 0-100 at index 2; y=10 is its top half, so: before c.
    const out = moveBlock([a, b, c], a.id, { zone: "root", index: edgeIndex(10, 0, 100, 2) });
    expect(out.map((x) => x.id)).toEqual([b.id, a.id, c.id]);
  });

  it("dropped on the bottom half of the last block, it lands at the end", () => {
    const [a, b, c] = [newBlock("heading"), newBlock("text"), newBlock("button")];
    const out = moveBlock([a, b, c], a.id, { zone: "root", index: edgeIndex(90, 0, 100, 2) });
    expect(out.map((x) => x.id)).toEqual([b.id, c.id, a.id]);
  });

  it("can be dragged out of a column and back to the canvas", () => {
    const row = newBlock("row");
    const kid = newBlock("button");
    row.columns![0] = [kid];
    const out = moveBlock([row], kid.id, { zone: "root", index: 0 });
    expect(out[0].id).toBe(kid.id);
    expect(out[1].columns![0]).toEqual([]);
  });
});

describe("the image control keeps a way to get a picture in", () => {
  // Removing the typed form would otherwise have taken image upload with it —
  // the only way to get a file onto a page.
  const render1 = (props: Partial<React.ComponentProps<typeof ImageControl>> = {}) =>
    renderToStaticMarkup(
      <ImageControl label={<span>Image</span>} value="" onChange={() => {}} {...props} />,
    );

  it("opens the media window", () => {
    // Upload used to be a file input here and a library button beside it. Both
    // are inside the window now, so this is the one control.
    expect(render1()).toContain("Select image");
  });

  it("says replace once there is something to replace", () => {
    expect(render1({ value: "https://x.test/a.jpg" })).toContain("Replace image");
  });

  it("still takes a pasted URL", () => {
    // An image hosted somewhere else never goes through the library at all.
    expect(render1()).toContain("…or paste a URL");
  });

  it("previews what is already set", () => {
    expect(render1({ value: "https://x.test/a.jpg" })).toContain('src="https://x.test/a.jpg"');
  });
});

describe("the canvas shows the store's own type", () => {
  const preview = {
    fontCss: '@font-face{font-family:"Probe";font-style:normal;font-weight:400;src:url("/x.woff2") format("woff2")}',
    typography: normalizeSiteTypography({
      h1: { desktop: { size: "41px" }, mobile: { size: "23px" } },
    }),
  };
  const withPreview = renderToStaticMarkup(
    <BlockEditor
      blocks={[newBlock("heading")]}
      theme={navy}
      title="Hero"
      onChange={() => {}}
      onClose={() => {}}
      preview={preview}
    />,
  );

  it("declares the store's faces and the store's type", () => {
    // Without the faces, a family the store installed renders here as the
    // fallback — the setting looks broken in the one place it is being set.
    expect(withPreview).toContain(preview.fontCss);
    expect(withPreview).toContain(`.${PREVIEW_SCOPE} h1{font-size:41px}`);
  });

  it("leaves the admin's own chrome alone", () => {
    // `:root h1` here would restyle the admin around the canvas, including the
    // settings page you would go to to undo it.
    expect(withPreview).not.toContain(":root h1");
    expect(withPreview).toContain(`class="${PREVIEW_SCOPE} mx-auto`);
  });

  it("writes the width it is showing, not a media query", () => {
    // The canvas is 390px wide inside a 1900px window: a max-width query would
    // never match, so the phone view would silently show the desktop type.
    expect(withPreview).not.toContain("@media");
    expect(withPreview).not.toContain("23px");
  });

  it("ships nothing at all when the store has set nothing", () => {
    expect(shell([newBlock("heading")])).not.toContain("<style");
  });
});

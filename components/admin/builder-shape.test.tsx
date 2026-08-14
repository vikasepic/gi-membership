import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BlockTree } from "@/components/admin/block-tree";
import { SectionSettings } from "@/components/admin/section-settings";
import { readFileSync } from "node:fs";
import { newBlock, setColumnWidth, setPropsAt } from "@/lib/blocks";
import { sections, asSegment, groupedPalette, PALETTE, BLOCK_ICON, SEGMENT_ICONS } from "@/lib/block-controls";
import { stacksAt } from "@/lib/block-style";
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
    const align = controlsFor(newBlock("button")).style.find((c) => "key" in c && c.key === "blockAlign");
    expect(align && asSegment(align)).toBe(true);
  });

  it("leaves a long list as a dropdown", () => {
    // Four bands as four buttons is fine; the case this guards is the long one.
    const band = controlsFor(newBlock("heading")).advanced.find(
      (c) => "key" in c && c.key === "background.type",
    );
    expect(band && asSegment(band)).toBe(true);

    // Width is two words now — Fill or Custom — so it earns being buttons.
    // It was five, and five widths as five buttons is five nobody can read.
    const width = controlsFor(newBlock("heading")).advanced.find((c) => "key" in c && c.key === "width");
    expect(width && asSegment(width)).toBe(true);
  });
});

describe("the palette", () => {
  it("groups every block type somewhere", () => {
    // A type added to PALETTE and forgotten here would be invisible. No single
    // owner offers everything any more — the storefront blocks and the checkout
    // blocks are gated to opposite pages — so the two trays are asked together.
    const shown = [...groupedPalette("", "store"), ...groupedPalette("", "checkout")].flatMap((g) =>
      g.items.map((i) => i.label),
    );
    for (const p of PALETTE) expect(shown, p.label).toContain(p.label);
  });

  it("offers the storefront blocks on the home page and nowhere else", () => {
    // They draw the catalogue and the subscriptions, and only the storefront
    // supplies that. In a product page's tray they would be blocks that render
    // nothing wherever they were dropped.
    const labels = (owner: "product" | "offer" | "store" | "checkout") =>
      groupedPalette("", owner).flatMap((g) => g.items.map((i) => i.label));
    for (const label of ["Catalogue", "Memberships", "Featured"]) {
      expect(labels("store"), label).toContain(label);
      expect(labels("product"), label).not.toContain(label);
      expect(labels("offer"), label).not.toContain(label);
      expect(labels("checkout"), label).not.toContain(label);
    }
    // And nothing else was lost on the way.
    expect(labels("product")).toContain("Heading");
    expect(labels("product").length).toBe(labels("store").length - 3);
  });

  it("offers the checkout blocks on the checkout and nowhere else", () => {
    // Same rule, other direction: only the checkout can supply an order, so a
    // card-fields block anywhere else would draw nothing.
    const labels = (owner: "product" | "offer" | "store" | "checkout") =>
      groupedPalette("", owner).flatMap((g) => g.items.map((i) => i.label));
    for (const label of [
      "Their details",
      "Order bump",
      "Order summary",
      "Coupon field",
      "Card fields",
      "Due today",
      "Pay button",
    ]) {
      expect(labels("checkout"), label).toContain(label);
      expect(labels("product"), label).not.toContain(label);
      expect(labels("store"), label).not.toContain(label);
    }
    expect(labels("checkout")).toContain("Heading");
    expect(labels("checkout").length).toBe(labels("product").length + 7);
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

  it("says so when the section is empty", () => {
    // "the page" was wrong: this tree is one section's blocks, and the page has
    // twelve of them.
    expect(tree([])).toContain("Nothing in this section yet");
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

describe("a segment only where the words fit", () => {
  const opt = (labels: string[]) =>
    ({ kind: "select", key: "x", label: "X", options: labels.map((l) => [l.toLowerCase(), l]) }) as never;

  it("keeps a dropdown for long options", () => {
    // "Never — keep them side by side" as a button wrapped to four lines and
    // made the control taller than the rest of the panel.
    expect(asSegment(opt(["On mobile", "On tablet and mobile", "Never — keep them side by side"]))).toBe(false);
  });

  it("keeps a dropdown for four medium ones", () => {
    // Stretch / Top / Middle / Bottom fitted the option count and not the panel:
    // Bottom rendered as "Bottc".
    expect(asSegment(opt(["Stretch", "Top", "Middle", "Bottom"]))).toBe(false);
  });

  it("still uses buttons for short ones", () => {
    expect(asSegment(opt(["Solid", "Outline"]))).toBe(true);
  });

  it("always uses buttons where there are icons", () => {
    // A glyph is a glyph however long its name is.
    const align = { kind: "select", key: "align", label: "Align", options: [["left", "Left"], ["center", "Centre"], ["right", "Right"]] } as never;
    expect(asSegment(align)).toBe(true);
  });

  it("checks every real control against the same rule", () => {
    // A long label in a button is the failure mode; nothing in the schema
    // should be able to reach one.
    for (const t of BLOCK_TYPES) {
      const b = newBlock(t);
      for (const tab of ["content", "style", "advanced"] as const) {
        for (const c of controlsFor(b)[tab]) {
          if (!("kind" in c) || c.kind !== "select" || !asSegment(c)) continue;
          if (SEGMENT_ICONS[c.key.split(".").pop() ?? ""]) continue;
          for (const [, l] of c.options) expect(l.length, `${t}/${c.key}/${l}`).toBeLessThanOrEqual(8);
        }
      }
    }
  });
});

describe("stacked columns explain themselves", () => {
  it("knows a row is stacked on a phone", () => {
    const row = newBlock("row");
    row.columns = [[], []];
    expect(stacksAt(row, "mobile")).toBe(true);
    expect(stacksAt(row, "desktop")).toBe(false);
  });

  it("stops saying so once a width is set for that width", () => {
    const row = setPropsAt(newBlock("row"), "mobile", { widths: [70, 30] });
    row.columns = [[], []];
    expect(stacksAt(row, "mobile")).toBe(false);
  });
});

describe("the band is edited where you can see it", () => {
  const section = {
    style: "paper",
    accent: null,
    variant: null,
    enabled: true,
    variants: [{ key: "wide", label: "Wide" }],
    onChange: () => {},
  };
  const panel = () =>
    renderToStaticMarkup(<SectionSettings section={section} />);

  it("offers the band colour, the accent and whether it shows", () => {
    const out = panel();
    expect(out).toContain("Colour");
    expect(out).toContain("Accent");
    expect(out).toContain("Show this section");
  });

  it("says why the panel is showing this rather than a block", () => {
    // An empty panel reads as a broken one.
    expect(panel()).toContain("Nothing selected");
  });

  it("no longer sits in the form behind the editor", () => {
    // Judging a band colour from there meant closing the only view of what it
    // applies to.
    // On the controls, not the words — a comment explaining the move mentions
    // them, and matching prose would fail on the explanation instead of the code.
    const form = readFileSync("components/admin/page-editor.tsx", "utf8");
    expect(form).not.toContain("BAND_STYLE_KEYS");
    expect(form).not.toContain('onChange({ enabled:');
    expect(form).not.toContain('onChange({ accent:');
  });

  it("is handed to the editor by the page builder", () => {
    expect(readFileSync("components/admin/page-editor.tsx", "utf8")).toContain("section={section}");
  });
});

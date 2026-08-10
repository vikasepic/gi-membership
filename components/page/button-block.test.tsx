import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks } from "@/components/page/blocks";
import { newBlock } from "@/lib/blocks";
import { bandTheme } from "@/lib/page-sections";
import { controlsFor } from "@/lib/block-controls";

const render = (props: Record<string, unknown>, style: Record<string, unknown> = {}) => {
  const b = newBlock("button", {
    props: { text: "Buy now", action: "link", link: "https://x.test", variant: "solid", ...props },
  });
  b.style = { ...b.style, ...style } as typeof b.style;
  return renderToStaticMarkup(<Blocks blocks={[b]} theme={bandTheme("light")} />);
};

// Three settings that were on screen, could be changed, and did nothing.

describe("full width", () => {
  it("actually sets a width", () => {
    // It used to set display:block beside a `w-fit` class that pinned the width
    // to fit-content, so the button became block-level and stayed exactly as
    // wide as its label.
    expect(render({ fullWidth: true })).toContain("width:100%");
  });

  it("leaves the button its own size when off", () => {
    const out = render({ fullWidth: false });
    expect(out).toContain("display:inline-block");
    expect(out).not.toContain("width:100%");
  });

  it("no longer carries a class that pins the width", () => {
    expect(render({ fullWidth: true })).not.toContain("w-fit");
  });
});

describe("align", () => {
  it("is offered on the button itself", () => {
    // Nobody looks under Advanced to centre a button.
    const keys = controlsFor(newBlock("button")).style.map((c) => ("key" in c ? c.key : ""));
    // A button is a box you place, not a paragraph you align.
    expect(keys).toContain("blockAlign");
  });

  it("is still offered once the button fills the row", () => {
    // Rewritten to new intent, and the old one never bit: it asserted the
    // absence of "align" from a list that only ever held "blockAlign". The
    // control stays because Centre moves a full-width button too — the auto
    // cross-axis margin stops the wrapper stretching and the anchor's 100%
    // resolves against what is left.
    const full = newBlock("button", { props: { text: "x", fullWidth: true } });
    const keys = controlsFor(full).style.map((c) => ("key" in c ? c.key : ""));
    expect(keys).toContain("blockAlign");
  });

  it("can move an ordinary button", () => {
    // Only reachable because the button is inline-block: a block-level box
    // ignores its parent's text-align entirely.
    const out = render({ fullWidth: false }, { blockAlign: "center" });
    expect(out).toContain("text-align:center");
    expect(out).toContain("display:inline-block");
  });
});

describe("weight", () => {
  it("reaches the button", () => {
    expect(render({}, { weight: 400 })).toContain("font-weight:400");
  });

  it("is not overruled by a class", () => {
    // `font-semibold` sat on the element and the inline weight had to fight it.
    expect(render({}, { weight: 400 })).not.toContain("font-semibold");
  });

  it("has more than one weight to choose from", () => {
    // The real cause: Inter was loaded pinned to 600, so Regular, Semibold and
    // Bold all rendered as 600 — the control changed a number and nothing else.
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).not.toMatch(/Inter\(\{[^}]*weight:/);
    expect(layout).toMatch(/Poppins\(\{[\s\S]*?"700"/);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionSettings } from "@/components/admin/section-settings";
import { controlsFor, COLUMN_CONTROLS } from "@/lib/block-controls";
import { newBlock } from "@/lib/blocks";

// One switch, everywhere, meaning the same thing.

const FILES = [
  "components/admin/page-editor.tsx",
  "components/admin/block-editor.tsx",
  "components/admin/section-settings.tsx",
  "components/admin/product-form.tsx",
];

describe("every switch in the admin", () => {
  it.each(FILES)("%s keeps its knob inside the track", (file) => {
    // The old geometry — a 28px track, a 12px knob and a 14px shift — put the
    // knob's right edge exactly on the track's, so it spilled out and read as
    // broken. Every one of them had it.
    const src = readFileSync(file, "utf8");
    expect(src).not.toContain("translate-x-[1.125rem]");
    expect(src).not.toContain("h-5 w-9");
  });

  it.each(FILES)("%s is green when on, not the brand colour", (file) => {
    // Rust is what actions are. A rust switch beside a rust Save button says
    // the same thing about two different kinds of thing.
    const src = readFileSync(file, "utf8");
    if (!src.includes('role="switch"')) return;
    expect(src).toContain("bg-[#3f9b6d]");
  });
});

describe("a switch never means its own opposite", () => {
  it("asks whether to SHOW a block at each width", () => {
    // hideMobile is true when the block is gone, so a switch reading it
    // directly is on when the thing is off — which cannot be coloured honestly.
    const advanced = controlsFor(newBlock("heading")).advanced;
    const hides = advanced.filter((c) => "key" in c && String(c.key).startsWith("hide"));
    expect(hides.length).toBe(3);
    for (const c of hides) {
      expect("label" in c && c.label.startsWith("Show"), String(c.label)).toBe(true);
      expect("invert" in c && c.invert).toBe(true);
    }
  });

  it("flips the value on the way in and out", () => {
    const src = readFileSync("components/admin/block-editor.tsx", "utf8");
    expect(src).toContain("const shown = control.invert ? !stored : stored");
    expect(src).toContain("onChange(control.invert ? shown : !stored)");
  });
});

describe("a background image is findable", () => {
  it("says what Classic gives you", () => {
    // Every colour and image field is hidden until the type is Classic, so a
    // page showing "None" looks like a page with no image option at all.
    const advanced = controlsFor(newBlock("heading")).advanced;
    const type = advanced.find((c) => "key" in c && c.key === "background.type");
    expect(type && "hint" in type && type.hint).toContain("image");
  });

  it("reveals the image field once the type is Classic", () => {
    // Hidden while the type is None on purpose — the fields would describe a
    // background that is not being drawn.
    const plain = newBlock("heading");
    expect(
      controlsFor(plain).advanced.some((c) => "key" in c && c.key === "background.image"),
    ).toBe(false);

    const withBg = newBlock("heading");
    withBg.style = { ...withBg.style, background: { ...withBg.style.background, type: "classic" } };
    expect(
      controlsFor(withBg).advanced.some((c) => "key" in c && c.key === "background.image"),
    ).toBe(true);
  });

  it("offers one on a column too", () => {
    const image = COLUMN_CONTROLS.find((c) => "key" in c && c.key === "background.image");
    expect(image).toBeTruthy();
  });
});

describe("the section's own switch", () => {
  it("says what switching it off keeps", () => {
    const out = renderToStaticMarkup(
      <SectionSettings
        section={{ style: "paper", accent: null, variant: null, enabled: true, onChange: () => {} }}
      />,
    );
    expect(out).toContain("Switching it off keeps everything in it");
    expect(out).toContain('aria-checked="true"');
  });
});

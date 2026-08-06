import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BLOCK_CONTROLS } from "@/lib/block-controls";
import { newBlock } from "@/lib/blocks";

const ratioControl = (type: "image" | "video") => {
  const all = [...BLOCK_CONTROLS[type].content, ...BLOCK_CONTROLS[type].style];
  const c = all.find((x) => "key" in x && x.key === "ratio");
  return c && "options" in c ? (c.options as [string, string][]) : [];
};

describe("the shape an image is shown at", () => {
  it("offers showing the whole picture", () => {
    // Every fixed ratio crops. A screenshot or a mockup, where the edges ARE
    // the content, has no correct answer in a list of boxes.
    expect(ratioControl("image").map(([v]) => v)).toContain("auto");
  });

  it("offers it first", () => {
    // It is the honest default for an image nobody has thought about yet.
    expect(ratioControl("image")[0][0]).toBe("auto");
  });

  it("says what it does, not just what it is called", () => {
    const [, label] = ratioControl("image")[0];
    expect(label.toLowerCase()).toContain("no crop");
  });

  it("keeps every crop that was there before", () => {
    // Existing pages store one of these; losing one would resize live artwork.
    const values = ratioControl("image").map(([v]) => v);
    for (const r of ["16/9", "4/3", "1/1", "3/4", "21/9"]) expect(values).toContain(r);
  });

  it("does not offer it for a video", () => {
    // An embed needs a box before it loads. With no ratio it collapses to
    // nothing and then jumps when the player arrives.
    expect(ratioControl("video").map(([v]) => v)).not.toContain("auto");
  });

  it("leaves the default alone", () => {
    // Changing it would reshape every image block already on a live page.
    expect(newBlock("image").props.ratio).toBe("16/9");
  });
});

describe("what the renderer does with it", () => {
  const src = readFileSync("components/page/blocks.tsx", "utf8");

  it("drops the crop as well as the box", () => {
    // Leaving objectFit: cover behind would keep cropping to a box that is no
    // longer there — the setting would look applied and change nothing.
    expect(src).toContain('const whole = ratio === "auto"');
    expect(src).toContain('objectFit: whole ? undefined : "cover"');
    expect(src).toContain("aspectRatio: whole ? undefined : ratio");
  });

  it("lets the height follow the picture", () => {
    expect(src).toContain('height: whole ? "auto" : undefined');
  });
});

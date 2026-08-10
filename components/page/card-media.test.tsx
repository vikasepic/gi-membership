import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { normalizeBlocks } from "@/lib/blocks";

const theme = bandTheme("paper");
const card = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    <Blocks blocks={normalizeBlocks([{ id: "c1", type: "cards", props, style: {} }])} theme={theme} at="desktop" />,
  );

/**
 * The tile is what gives a monochrome SVG presence in a card. Behind an
 * uploaded picture it is a coloured square peeking out around someone's
 * artwork — which is exactly what shipped: a terracotta tile behind a pink
 * illustration, with the illustration drawn at the icon's 22px inside a 44px
 * box, like a stamp in the corner.
 */
describe("the tile behind a picture", () => {
  it("does not paint the accent behind an uploaded image", () => {
    const out = card({ media: "image", items: [{ title: "t", body: "b", image: "library/x.png" }] });
    expect(out).toContain("transparent");
    expect(out).not.toContain(theme.accent);
  });

  it("draws the picture at the tile's size, not the icon's", () => {
    const out = card({ media: "image", iconBox: 60, items: [{ title: "t", image: "library/x.png" }] });
    expect(out).toMatch(/width:60px;height:60px[^"]*"[^>]*>\s*<img/);
  });

  it("still paints the tile behind an icon", () => {
    const out = card({ media: "icon", items: [{ title: "t", icon: "<svg></svg>" }] });
    expect(out).toContain(theme.accent);
    expect(out).not.toContain("transparent");
  });
});

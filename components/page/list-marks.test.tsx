import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Blocks } from "@/components/page/blocks";
import { bandTheme } from "@/lib/page-sections";
import { normalizeBlocks } from "@/lib/blocks";
import { LIST_ICONS, listIconPath } from "@/lib/list-icons";

const theme = bandTheme("paper");
const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    <Blocks blocks={normalizeBlocks([{ id: "b1", type: "iconlist", props }])} theme={theme} />,
  );
const LINES = [{ text: "One" }, { text: "Two" }];

describe("what a list puts in front of a line", () => {
  it("still draws a tick when nothing was chosen", () => {
    // Every list saved before this existed has no `marker` at all, and must
    // keep the mark it has always had.
    const out = render({ items: LINES });
    expect(out).toContain(listIconPath("check")!);
  });

  it("draws whichever mark was chosen", () => {
    for (const id of ["arrow", "star", "dot", "lock"]) {
      expect(render({ items: LINES, marker: id })).toContain(listIconPath(id)!);
    }
  });

  it("draws none when asked for none, and still draws the words", () => {
    const out = render({ items: LINES, marker: "none" });
    expect(out).not.toContain("<svg");
    expect(out).toContain("One");
  });

  it("uses the list's own picture", () => {
    const out = render({ items: LINES, marker: "image", markerImage: "https://x.test/m.svg" });
    expect(out).toContain("https://x.test/m.svg");
    expect(out).not.toContain("<svg");
  });

  it("lets one line carry its own picture, over the list's mark", () => {
    const out = render({
      items: [{ text: "One", image: "https://x.test/one.png" }, { text: "Two" }],
      marker: "check",
    });
    expect(out).toContain("https://x.test/one.png");
    // The other line still has the drawn tick.
    expect(out).toContain(listIconPath("check")!);
  });

  it("spaces the mark from its words separately from the lines", () => {
    // One number used to do both jobs, so neither could be set.
    const out = render({ items: LINES, gap: 30, iconGap: 4 });
    expect(out).toContain("gap:30px");
    expect(out).toContain("gap:4px");
  });

  it("takes the colour it is given, and the accent otherwise", () => {
    expect(render({ items: LINES, iconColor: "#ff0000" })).toContain("fill:#ff0000");
    expect(render({ items: LINES })).toContain(`fill:${theme.accent}`);
  });

  it("falls back to a tick for a mark that no longer exists", () => {
    // A list saved with a mark that was later renamed keeps a bullet rather
    // than silently losing it.
    expect(render({ items: LINES, marker: "no-such-mark" })).toContain(listIconPath("check")!);
  });

  it("offers marks that are all real paths", () => {
    for (const i of LIST_ICONS) {
      expect(i.d, i.id).toMatch(/^[Mm]/);
      expect(i.label.length, i.id).toBeGreaterThan(0);
    }
    expect(new Set(LIST_ICONS.map((i) => i.id)).size).toBe(LIST_ICONS.length);
  });

  it("needs no network for any of them", () => {
    // The reason these are paths and not a font: an icon library is either a
    // dependency or somebody else's CDN on every page of the store.
    const out = render({ items: LINES, marker: "star" });
    expect(out).not.toContain("fontawesome");
    expect(out).not.toMatch(/<link|@import/);
  });

  it("draws a Font Awesome icon from the path stored in the block", () => {
    // The whole design in one test: the page has no library and makes no
    // request — the icon travels as its own path inside the block.
    const out = render({
      items: LINES,
      marker: "fa",
      markerIcon: { v: "0 0 448 512", d: "M438.6 105.4L167 377z" },
    });
    expect(out).toContain('viewBox="0 0 448 512"');
    expect(out).toContain("M438.6 105.4L167 377z");
  });

  it("falls back to a drawn mark when the icon was never chosen", () => {
    // Marker set to "fa" with nothing picked yet must not lose its bullets.
    expect(render({ items: LINES, marker: "fa" })).toContain(listIconPath("check")!);
  });

  it("takes the mark colour for a Font Awesome icon too", () => {
    const out = render({
      items: LINES, marker: "fa", iconColor: "#00ff00",
      markerIcon: { v: "0 0 448 512", d: "M1 2" },
    });
    expect(out).toContain("fill:#00ff00");
  });
});

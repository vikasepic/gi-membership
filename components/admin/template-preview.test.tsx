// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { TemplatePreview } from "@/components/admin/template-preview";
import { bandTheme } from "@/lib/page-sections";
import { listTemplates } from "@/lib/templates/index";

let root: { unmount: () => void } | null = null;
afterEach(() => { const r = root; root = null; if (r) act(() => r.unmount()); });

const first = listTemplates()[0];

function mount(height?: number) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = createRoot(host); root = r;
  act(() => {
    r.render(<TemplatePreview template={first} theme={bandTheme("paper")} height={height} />);
  });
  return host;
}

const scaleOf = (host: HTMLElement) => {
  const el = host.querySelector<HTMLElement>('[class*="origin-top-left"]');
  const m = /scale\(([\d.e-]+)\)/.exec(el?.style.transform ?? "");
  return m ? Number(m[1]) : NaN;
};

/**
 * Every design previewed as a flat coloured bar.
 *
 * The scale fell back to `0.0001` until the box had been measured — one
 * ten-thousandth, which puts the whole design inside the tile's top-left pixel
 * and leaves nothing but band colour. Anything that stopped the measurement
 * arriving produced that: an observer that threw, a grid mounted before its
 * container had a width, a runtime with no ResizeObserver.
 */
describe("a template preview always shows the design", () => {
  it("renders at a usable scale even when nothing has measured it", () => {
    // jsdom reports every width as 0, which is the same position a browser is
    // in for the first frame — and the position this used to render blind in.
    const s = scaleOf(mount(240));
    expect(s).toBeGreaterThan(0.1);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("puts the design's own words in the tile", () => {
    // Not an empty box with a background: the actual blocks.
    expect(mount(240).textContent!.length).toBeGreaterThan(50);
  });

  it("does not throw where ResizeObserver is missing", () => {
    // It used to. That is also why nothing had ever rendered this component in
    // a test, which is how the blank previews survived.
    expect(typeof ResizeObserver).toBe("undefined");
    expect(() => mount(240)).not.toThrow();
  });

  it("keeps the height it was given, so a grid stays a grid", () => {
    const box = mount(240).firstElementChild as HTMLElement;
    expect(box.style.height).toBe("240px");
  });

  it("still has a height with no cap and nothing measured", () => {
    // Uncapped, the box takes the design's own scaled height once measured. In
    // jsdom nothing measures, so this is the fallback — and the point is that
    // there IS one: a zero-height box is a preview nobody can see.
    const box = mount(undefined).firstElementChild as HTMLElement;
    expect(box.style.height).toBe("240px");
  });
});

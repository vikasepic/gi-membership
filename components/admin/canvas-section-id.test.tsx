// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BlockEditor } from "@/components/admin/block-editor";
import { bandTheme } from "@/lib/page-sections";
import { newBlock } from "@/lib/blocks";

/**
 * The canvas band wears the section's id.
 *
 * Reported 16 Sep 2026: page CSS written against `#section-hero` worked on
 * the live page and did nothing in the builder, because the canvas band had
 * no id for it to find. Same name, same fallback, as the live band.
 */
// Unmounted, not just removed: the builder portals its overlay to the end
// of the body, so a stale one would answer the next test's query.
let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null;
});
const mount = (section: Record<string, unknown>) => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <BlockEditor
        blocks={[newBlock("heading")]}
        theme={bandTheme("paper")}
        title="Hero"
        onClose={() => {}}
        onChange={() => {}}
        section={{ style: "paper", accent: null, variant: null, enabled: true, onChange: () => {}, ...section }}
      />,
    );
  });
};

describe("the canvas band", () => {
  it("is named after the section when it has no id of its own", () => {
    mount({ sectionKey: "hero", cssId: null, cssClass: null });
    expect(document.getElementById("section-hero")).not.toBeNull();
  });
  it("wears the id and class the owner gave it", () => {
    mount({ sectionKey: "hero", cssId: "top-band", cssClass: "gi-parts" });
    expect(document.getElementById("top-band")?.classList.contains("gi-parts")).toBe(true);
    expect(document.getElementById("section-hero")).toBeNull();
  });
});

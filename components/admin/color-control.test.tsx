/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ColorControl, PaletteContext } from "@/components/admin/color-control";
import { colorToken, type PaletteColor } from "@/lib/palette";

const BRAND: PaletteColor = { id: "a1b2c3d4", name: "Brand", value: "#b4472b" };
const INK: PaletteColor = { id: "ffff0000", name: "Ink", value: "#16181f" };

/**
 * The list is portalled to the body, and that is not cosmetic.
 *
 * Every panel this control sits in is a scrolling box with `overflow: hidden`
 * somewhere above it, and an overflow ancestor clips a child whatever its
 * z-index says — so the list was being cut off at the edge of the inspector
 * with half its colours unreachable. "The global colours don't work" meant
 * "I cannot click them".
 */
function mount(onChange: (v: string | null) => void) {
  const host = document.createElement("div");
  // The clipping ancestor, reproduced: without the portal the list renders
  // inside this and is cut off.
  host.style.overflow = "hidden";
  document.body.append(host);
  const root = createRoot(host);
  return {
    host,
    render: () =>
      act(() => {
        root.render(
          <PaletteContext.Provider value={[BRAND, INK]}>
            <ColorControl label="Colour" value={null} onChange={onChange} />
          </PaletteContext.Provider>,
        );
      }),
  };
}

describe("choosing a global colour", () => {
  // The list lives on the body now, so it outlives its host unless it is
  // cleared — which is itself worth knowing about a portal.
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the list outside the box that would clip it", async () => {
    const { host, render } = mount(() => {});
    await render();
    const globe = host.querySelector<HTMLButtonElement>('[aria-expanded]')!;
    await act(async () => globe.click());

    const list = document.querySelector('[role="listbox"]');
    expect(list, "the list rendered at all").toBeTruthy();
    expect(host.contains(list!), "it escaped the clipping ancestor").toBe(false);
    expect(document.body.contains(list!)).toBe(true);
  });

  it("writes a reference, not a copy, when one is picked", async () => {
    let got: string | null | undefined;
    const { host, render } = mount((v) => {
      got = v;
    });
    await render();
    const globe = host.querySelector<HTMLButtonElement>('[aria-expanded]')!;
    await act(async () => globe.click());

    const rows = document.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(rows.length).toBe(2);
    await act(async () => rows[0].click());
    expect(got).toBe(colorToken(BRAND));
  });

  it("names every colour and shows its hex", async () => {
    const { host, render } = mount(() => {});
    await render();
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-expanded]')!.click());
    const text = document.querySelector('[role="listbox"]')!.textContent ?? "";
    expect(text).toContain("Brand");
    expect(text).toContain("#b4472b");
    expect(text).toContain("Ink");
  });
});

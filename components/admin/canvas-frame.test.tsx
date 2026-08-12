/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { DEVICE_MAX } from "@/lib/blocks";
import { deviceForWidth, widthRange } from "@/components/admin/canvas-frame";

/**
 * The numbers, not the drag.
 *
 * A pointer drag in jsdom measures a box that is always 0×0, so a test of the
 * gesture would only be testing the stub. What is worth pinning is the thing
 * that made the old three-fixed-widths canvas dishonest: which device a width
 * IS, and whether the editor agrees with the stylesheet about where a
 * breakpoint sits.
 */

describe("which device a width is", () => {
  it("agrees with the breakpoints the page renders at", () => {
    const phone = DEVICE_MAX.mobile!;
    const tablet = DEVICE_MAX.tablet!;
    expect(deviceForWidth(phone)).toBe("mobile");
    expect(deviceForWidth(phone + 1)).toBe("tablet");
    expect(deviceForWidth(tablet)).toBe("tablet");
    expect(deviceForWidth(tablet + 1)).toBe("desktop");
  });

  it("calls a narrow width mobile even when the tablet tab was pressed", () => {
    // The whole point: drag a tablet down to 700 and the mobile rules are what
    // is rendering, so the switch has to say Mobile.
    expect(deviceForWidth(700)).toBe("mobile");
  });
});

describe("the range a tab governs", () => {
  it("covers every width with no gap and no overlap", () => {
    const m = widthRange("mobile");
    const t = widthRange("tablet");
    const d = widthRange("desktop");
    expect(t.min).toBe(m.max + 1);
    expect(d.min).toBe(t.max + 1);
  });

  it("puts every width inside the range of the device it belongs to", () => {
    for (const w of [280, 390, 767, 768, 834, 1023, 1024, 1440]) {
      const r = widthRange(deviceForWidth(w));
      expect(w >= r.min && w <= r.max, `${w}px`).toBe(true);
    }
  });
});

describe("the handles", () => {
  it("resize with the arrow keys and move the tab with the width", async () => {
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const { CanvasFrame } = await import("@/components/admin/canvas-frame");
    const React = await import("react");

    let width: number | null = 800;
    let device: "desktop" | "tablet" | "mobile" = "tablet";
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const render = () =>
      act(() => {
        root.render(
          React.createElement(
            CanvasFrame,
            {
              device,
              width,
              onWidth: (w: number | null) => (width = w),
              onDevice: (d: typeof device) => (device = d),
            },
            React.createElement("p", null, "page"),
          ),
        );
      });
    await render();

    const handle = host.querySelector("button")!;
    // Shift is the coarse step: 800 → 750 → 700, which is below 768 and so is
    // no longer a tablet.
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        handle.dispatchEvent(
          new window.KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true }),
        );
      });
      await render();
    }
    expect(width).toBe(700);
    expect(device).toBe("mobile");
  });
});

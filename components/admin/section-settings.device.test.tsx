// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SectionSettings } from "@/components/admin/section-settings";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  host = null;
});

function mount(device: "desktop" | "mobile", onChange = vi.fn()) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <SectionSettings
        device={device}
        section={{
          style: "paper",
          accent: null,
          variant: null,
          enabled: true,
          background: null,
          layout: { pad: { t: 80, r: 80, b: 80, l: 80 }, padUnit: "px" },
          onChange,
        }}
      />,
    ),
  );
  return onChange;
}
const typePadding = (v: string) => {
  const field = host!.querySelector<HTMLInputElement>('input[aria-label="Padding value"]')!;
  // The element's own realm: vitest's jsdom can hand back a node whose
  // prototype is not the global HTMLInputElement, and React only notices a
  // value written through the native setter.
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")!.set!;
  setter.call(field, v);
  field.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("the section panel on a phone", () => {
  it("writes padding as the phone's override and leaves the desktop value alone", async () => {
    const onChange = mount("mobile");
    expect(host!.textContent).toContain("Phone");
    await act(async () => typePadding("24"));
    const patch = onChange.mock.calls.at(-1)![0] as { layout: { pad: { t: number }; responsive: { mobile: { pad: { t: number } } } } };
    expect(patch.layout.pad.t).toBe(80);
    expect(patch.layout.responsive.mobile.pad.t).toBe(24);
  });
  it("on desktop writes the padding itself, with no override", async () => {
    const onChange = mount("desktop");
    expect(host!.textContent).not.toContain("Phone");
    await act(async () => typePadding("24"));
    const patch = onChange.mock.calls.at(-1)![0] as { layout: { pad: { t: number }; responsive?: unknown } };
    expect(patch.layout.pad.t).toBe(24);
    expect(patch.layout.responsive).toBeUndefined();
  });
});

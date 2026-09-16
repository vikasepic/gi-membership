// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { ImageControl } from "@/components/admin/block-editor";

let host: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  host = null;
});
const button = (text: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;

describe("the image drawer", () => {
  it("opens on Choose with the library and a URL field, and a pasted URL lands on Use", async () => {
    const onChange = vi.fn();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<ImageControl label={<span>Image</span>} value="" onChange={onChange} />));
    expect(host.textContent).not.toContain("From the library");
    await act(async () => button("Choose").click());
    expect(host.textContent).toContain("From the library");
    const field = host.querySelector<HTMLInputElement>('input[aria-label="Image URL"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(field, "https://x.test/pasted.png");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Use").click());
    expect(onChange).toHaveBeenCalledWith("https://x.test/pasted.png");
    expect(host.textContent).not.toContain("From the library");
  });
});

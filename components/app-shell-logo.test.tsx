// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SETTINGS_DEFAULTS, type Settings } from "@/lib/settings-schema";

/**
 * What the header does when the logo file is not there.
 *
 * Its own file, and a jsdom one: `components/app-shell.test.tsx` runs in node
 * and asserts markup, and the whole of this behaviour is an event the browser
 * fires after the markup is out. Rendering to a string proves nothing about it
 * — `onError` is not in the string.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const { AppShell } = await import("@/components/app-shell");

let root: { unmount: () => void } | null = null;
let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  document.head.innerHTML = '<link rel="icon" href="/storage/v1/object/public/public-media/gone.png">';
});
afterEach(() => {
  const r = root;
  root = null;
  if (r) act(() => r.unmount());
  host.remove();
});

function mount(s: Partial<Settings> = {}) {
  const settings: Settings = { ...SETTINGS_DEFAULTS, name: "Greater Inside", logoPath: "gone.png", ...s };
  const r = createRoot(host);
  root = r;
  act(() => r.render(<AppShell settings={settings}><p>page</p></AppShell>));
}

const images = () => [...host.querySelectorAll("img")];
const fail = () => act(() => { for (const img of images()) img.dispatchEvent(new Event("error")); });

describe("a logo path whose file has been deleted", () => {
  it("draws the mark instead of a broken image", () => {
    mount();
    // Three of them: mobile bar, desktop bar, footer. All one path, so one
    // failure answers for all three.
    expect(images()).toHaveLength(3);
    fail();
    expect(images()).toHaveLength(0);
    expect(host.querySelectorAll("svg[aria-label='Greater Inside']").length).toBe(3);
  });

  it("falls to the store name when that is the fallback the owner chose", () => {
    mount({ siteShell: { ...SETTINGS_DEFAULTS.siteShell, brandFallback: "name" } });
    fail();
    expect(host.textContent).toContain("Greater Inside");
  });

  it("points the tab at the app's own mark, because it had the same dead path", () => {
    mount();
    fail();
    expect(document.querySelector("link[rel='icon']")!.getAttribute("href")).toBe("/icon.svg");
  });

  it("leaves the tab alone when the favicon is a file of its own", () => {
    // Only the logo is known to be gone. A separately uploaded favicon is a
    // different object and nothing here has heard anything about it.
    mount({ faviconPath: "favicon.png" });
    fail();
    expect(document.querySelector("link[rel='icon']")!.getAttribute("href")).toContain("gone.png");
  });
});

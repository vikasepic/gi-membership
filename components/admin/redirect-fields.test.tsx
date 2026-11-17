// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RedirectFields } from "@/components/admin/redirect-fields";
import { redirectSchema, type StoreRedirect } from "@/lib/redirects";

/** Settings › Redirects. Spec: docs/superpowers/specs/2026-11-17-redirect-manager-design.md. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const r = (o: Partial<StoreRedirect>) => redirectSchema.parse(o);
let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(rules: StoreRedirect[]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<RedirectFields redirects={rules} name="redirects" />));
  return host;
}
function type(el: HTMLInputElement, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const posted = (h: HTMLElement) => JSON.parse((h.querySelector('input[name="redirects"]') as HTMLInputElement).value);

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("the redirect rules form", () => {
  it("shows every option per rule and posts them", () => {
    const h = mount([r({ name: "Old FW", from: "^/blog/(.*)$", match: "pattern", to: "https://x.test/$1", permanent: false, query: "drop", enabled: false })]);
    for (const label of ["Name", "From", "Match", "To", "Type", "Query string", "On"]) expect(h.textContent).toContain(label);
    expect(posted(h)).toEqual([
      { name: "Old FW", from: "^/blog/(.*)$", match: "pattern", to: "https://x.test/$1", permanent: false, query: "drop", enabled: false },
    ]);
  });

  it("shows a save problem under its rule as it is typed", () => {
    const h = mount([r({ from: "/a", to: "https://greaterinside.com" })]);
    type(h.querySelector('input[aria-label="From, rule 1"]') as HTMLInputElement, "/checkout");
    expect(h.textContent).toContain("That address is part of the admin, checkout or members' area, so it can't be redirected.");
  });

  it("tests an address against the unsaved rules and shows the chain", () => {
    const h = mount([r({ from: "/a", to: "/b" }), r({ from: "/b", to: "https://greaterinside.com" })]);
    const test = h.querySelector('input[aria-label="Test an address"]') as HTMLInputElement;
    type(test, "/a");
    expect(h.textContent).toContain("Rule 1 → /b → Rule 2 → https://greaterinside.com/");
    type(test, "/admin");
    expect(h.textContent).toContain("Never redirected: admin, checkout or members' area.");
    type(test, "/zzz");
    expect(h.textContent).toContain("No rule catches this address.");
  });
});

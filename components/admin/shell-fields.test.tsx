// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SITE_SHELL_DEFAULTS, type SiteShell } from "@/lib/site-shell";
import { ShellFields } from "@/components/admin/shell-fields";

/**
 * The Header & navigation panel: what it holds, and what it posts.
 *
 * Everything goes through one hidden input, so "what it posts" is a string
 * readable at any moment — which is the whole reason the shape is one JSON
 * field rather than thirty named inputs.
 */

let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const root = mounted;
  mounted = null;
  if (root) act(() => root.unmount());
});

function mount(siteShell: SiteShell = SITE_SHELL_DEFAULTS) {
  const host = document.createElement("div");
  document.body.innerHTML = "";
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  act(() => {
    root.render(
      <form>
        <ShellFields siteShell={siteShell} errors={{}} />
      </form>,
    );
  });
}

/** What the form would send. */
const posted = (): SiteShell =>
  JSON.parse((document.querySelector('input[name="siteShell"]') as HTMLInputElement).value);

const rows = () => [...document.querySelectorAll('input[aria-label="Label"]')] as HTMLInputElement[];
const click = (el: Element | null) => act(() => (el as HTMLElement).click());

describe("the Header & navigation panel", () => {
  it("posts back exactly what it was given, untouched", () => {
    mount();
    // A store that opens the panel and saves without changing anything must
    // save the store it already had — links included, which is why they stay
    // an empty list until somebody edits one.
    expect(posted()).toEqual(SITE_SHELL_DEFAULTS);
    expect(posted().links).toEqual([]);
  });

  it("shows the three built-in links before any of them has been written down", () => {
    mount();
    expect(rows().map((i) => i.value)).toEqual(["Store", "Library", "Account"]);
  });

  it("writes the whole list down the moment one link is switched off", () => {
    mount();
    const box = document.querySelector('input[aria-label="Show Library"]') as HTMLInputElement;
    act(() => box.click());
    // Not just the one that changed: the shell reads "no links at all" as "use
    // the built-in three", so a partial list would put Library back.
    expect(posted().links).toEqual([
      { label: "Store", href: "/", on: true },
      { label: "Library", href: "/library", on: false },
      { label: "Account", href: "/account", on: true },
    ]);
  });

  it("reorders without losing a link", () => {
    mount();
    click(document.querySelectorAll('button[aria-label="Move down"]')[0]);
    expect(posted().links.map((l) => l.label)).toEqual(["Library", "Store", "Account"]);
  });

  it("adds and removes a link", () => {
    mount();
    click(
      [...document.querySelectorAll("button")].find((b) => b.textContent === "Add a link") ?? null,
    );
    expect(rows()).toHaveLength(4);
    click(document.querySelectorAll('button[aria-label="Remove"]')[3]);
    expect(posted().links.map((l) => l.label)).toEqual(["Store", "Library", "Account"]);
  });

  it("says so while a link that will be dropped is being typed", () => {
    mount();
    const href = document.querySelectorAll('input[aria-label="Link"]')[0] as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(href, "javascript:alert(1)");
      href.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // The save's own allow-list, not a second copy of it in the form — a copy
    // is what drifts, and drift here is a link that vanishes with nothing said.
    expect(document.body.textContent).toContain("start with / or https://");
  });
});

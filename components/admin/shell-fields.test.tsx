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
    // null until somebody edits one. Null is "nobody wrote a list"; an empty
    // array is "somebody emptied the bar", and the two must not be the same.
    expect(posted()).toEqual(SITE_SHELL_DEFAULTS);
    expect(posted().links).toBeNull();
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
    expect(posted().links!.map((l) => l.label)).toEqual(["Library", "Store", "Account"]);
  });

  it("adds and removes a link", () => {
    mount();
    click(
      [...document.querySelectorAll("button")].find((b) => b.textContent === "Add a link") ?? null,
    );
    expect(rows()).toHaveLength(4);
    click(document.querySelectorAll('button[aria-label="Remove"]')[3]);
    expect(posted().links!.map((l) => l.label)).toEqual(["Store", "Library", "Account"]);
  });

  it("lets the last link be removed, instead of putting all three back", () => {
    mount();
    for (const _ of [0, 1, 2]) click(document.querySelector('button[aria-label="Remove"]'));
    expect(rows()).toHaveLength(0);
    // An empty array, not null. `shellLinks` reads null as "use the built-in
    // three" — posting null here is what made × look broken.
    expect(posted().links).toEqual([]);
  });

  it("writes every control to the key the shell actually reads", () => {
    // The panel had one test for the links and none for the twenty-odd scalars,
    // so `barColour` for `barColor` — or any control wired to its neighbour's
    // key — would have been invisible: the render side is tested by building a
    // SiteShell directly, and never through this form.
    mount();
    const setText = (label: string, value: string) => {
      const el = document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    setText("Call to action label", "Join");
    expect(posted().ctaLabel).toBe("Join");
    setText("Footer note", "© 2026");
    expect(posted().footerNote).toBe("© 2026");
    // Two colour fields side by side in the same group: a swap between them is
    // the mistake this shape invites.
    const colours = [...document.querySelectorAll('input[aria-label="Colour"]')] as HTMLInputElement[];
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(colours[0], "#111111");
      colours[0].dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(posted().barColor).toBe("#111111");
    expect(posted().linkColor).toBe("");
  });

  it("says so while a colour that will be dropped is being typed", () => {
    mount();
    const el = document.querySelector('input[aria-label="Colour"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, "red");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // `normalizeHex` keeps 3- and 6-digit hex and nothing else, so "red",
    // "rgb(0,0,0)" and an alpha hex all become "" on save without a word.
    expect(document.body.textContent).toContain("dropped on save");
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

  it("says a row with only one half filled in will not be shown", () => {
    // `shellHrefIsValid` is true for "", so a label with an empty URL passed
    // every check the panel had and then failed to draw. The call to action
    // next door has said this about its own pair since it was written.
    mount();
    const href = document.querySelectorAll('input[aria-label="Link"]')[0] as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(href, "");
      href.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(document.body.textContent).toContain("No link yet, so this row is saved but not shown");
  });
});

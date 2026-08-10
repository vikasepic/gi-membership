// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { HEADING_SIZE } from "@/lib/block-style";
import { DEVICE_MAX } from "@/lib/blocks";
import { createRoot } from "react-dom/client";
import {
  SITE_TYPOGRAPHY_DEFAULTS,
  normalizeSiteTypography,
  type SiteTypography,
} from "@/lib/site-typography";

// The font library's three server actions are the only reason this module
// reaches into `app/` at all, and none of them is on screen in the panel. Left
// real they would drag the Supabase client and the admin guard into a jsdom
// run to be never called.
vi.mock("@/app/admin/settings/font-actions", () => ({
  installGoogleFontAction: async () => ({}),
  uploadFontAction: async () => ({}),
  removeFontAction: async () => {},
}));

const { TypographyFields } = await import("@/components/admin/typography-fields");

/**
 * The Typography panel: what it holds, and what it posts.
 *
 * Everything here goes through one hidden input, so "what it posts" is a
 * string that can be read at any moment — which is the whole reason the shape
 * is one JSON field rather than forty named inputs.
 */

let mounted: { unmount: () => void } | null = null;
afterEach(() => {
  const root = mounted;
  mounted = null;
  if (root) act(() => root.unmount());
});

function mount(siteTypography: SiteTypography = SITE_TYPOGRAPHY_DEFAULTS) {
  const host = document.createElement("div");
  document.body.innerHTML = "";
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted = root;
  act(() => {
    root.render(
      <form>
        <TypographyFields
          headingFont=""
          bodyFont=""
          siteTypography={siteTypography}
          installed={[{ id: "1", family: "Lora", source: "google", count: 2 }]}
          errors={{}}
        />
      </form>,
    );
  });
}

/** What the form would send. */
const posted = (): SiteTypography =>
  JSON.parse(
    (document.querySelector('input[name="siteTypography"]') as HTMLInputElement).value,
  ) as SiteTypography;

const click = (el: Element | null | undefined) => {
  if (!el) throw new Error("nothing to click");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const button = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim().replace(/\*$/, "") === text);

const field = <T extends HTMLElement>(label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as T;

/**
 * Type into a controlled input the way a person does.
 *
 * React tracks the last value it wrote and treats an unchanged one as no
 * event, so assigning `.value` alone never reaches the handler.
 */
function type(label: string, value: string) {
  const el = field<HTMLInputElement>(label);
  if (!el) throw new Error(`no field labelled ${label}`);
  const proto = Object.getPrototypeOf(el);
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  act(() => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pick(label: string, value: string) {
  const el = field<HTMLSelectElement>(label);
  if (!el) throw new Error(`no select labelled ${label}`);
  const proto = Object.getPrototypeOf(el);
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  act(() => {
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("the Typography panel", () => {
  it("posts a store that has set nothing back unchanged", () => {
    mount();
    // The default is what every store holds today. Opening the panel and
    // saving must not be a way to write anything.
    expect(posted()).toEqual(SITE_TYPOGRAPHY_DEFAULTS);
  });

  it("posts what it was given, untouched, for the ten elements you did not open", () => {
    const stored = normalizeSiteTypography({
      h2: { weight: "700", desktop: { size: "40px" } },
      body: { desktop: { lineHeight: "1.6" } },
    });
    mount(stored);
    click(button("H1"));
    type("Size", "60px");

    const out = posted();
    expect(out.h2).toEqual(stored.h2);
    expect(out.body).toEqual(stored.body);
    expect(out.h1.desktop.size).toBe("60px");
  });

  it("writes a measurement to the width being edited and no other", () => {
    mount();
    click(button("H1"));
    type("Size", "48px");
    expect(posted().h1.desktop.size).toBe("48px");
    expect(posted().h1.mobile.size).toBe("");

    click(button("Mobile"));
    // The narrower width starts empty rather than showing the wider one's
    // value: an inherited value typed into a box is a value pinned there.
    expect(field<HTMLInputElement>("Size").value).toBe("");
    type("Size", "30px");

    expect(posted().h1.desktop.size).toBe("48px");
    expect(posted().h1.mobile.size).toBe("30px");
    expect(posted().h1.tablet.size).toBe("");
  });

  it("keeps family, weight, case, style, decoration and colour off the width switch", () => {
    mount();
    click(button("H2"));
    pick("Weight", "700");
    pick("Case", "uppercase");
    pick("Family", "Lora");

    click(button("Tablet"));
    // The same values are still on screen, which is the panel saying out loud
    // that the switch does not reach them.
    expect(field<HTMLSelectElement>("Weight").value).toBe("700");
    expect(field<HTMLSelectElement>("Case").value).toBe("uppercase");

    pick("Weight", "300");
    click(button("Desktop"));
    expect(field<HTMLSelectElement>("Weight").value).toBe("300");

    const h2 = posted().h2 as unknown as Record<string, unknown>;
    expect(h2.weight).toBe("300");
    expect(h2.transform).toBe("uppercase");
    expect(h2.family).toBe("Lora");
    // And nowhere near a per-width bucket.
    expect(posted().h2.desktop).toEqual(SITE_TYPOGRAPHY_DEFAULTS.h2.desktop);
    expect(posted().h2.tablet).toEqual(SITE_TYPOGRAPHY_DEFAULTS.h2.tablet);
  });

  // NEW INTENT. This asserted "Desktop only", which was false about the rule
  // the panel writes: the desktop pass is emitted with NO media query, so it
  // is the base every narrower width inherits. The same three-tab control
  // appears in the block inspector meaning "this width and narrower", and one
  // control that means two things in two panels is the whole defect. The label
  // now says which widths the tab governs, off DEVICE_MAX, so the sentence
  // cannot drift from the query.
  it("labels the per-width group with the widths it governs, and names the four that move", () => {
    mount();
    expect(document.body.textContent).toContain("Desktop — every width");
    expect(document.body.textContent).not.toContain("Desktop only");
    expect(document.body.textContent).toContain(
      "size, line height, letter spacing and word spacing are the only four a width may change",
    );
    click(button("Mobile"));
    expect(document.body.textContent).toContain(`Mobile — ${DEVICE_MAX.mobile}px and narrower`);
    expect(document.body.textContent).not.toContain("Desktop — every width");
  });

  it("offers the paragraph gap on Body alone", () => {
    mount();
    expect(field("Paragraph gap")).toBeTruthy();
    click(button("H3"));
    expect(field("Paragraph gap")).toBeFalsy();
  });

  it("resets one element and leaves the rest alone", () => {
    mount();
    click(button("H1"));
    type("Size", "48px");
    click(button("Body"));
    type("Line height", "1.7");

    click(button("Reset Body"));
    expect(posted().body).toEqual(SITE_TYPOGRAPHY_DEFAULTS.body);
    expect(posted().h1.desktop.size).toBe("48px");
  });

  it("cannot reset an element that has nothing set", () => {
    mount();
    click(button("H4"));
    expect((button("Reset H4") as HTMLButtonElement).disabled).toBe(true);
    type("Word spacing", "0.02em");
    expect((button("Reset H4") as HTMLButtonElement).disabled).toBe(false);
  });

  it("marks h5 and h6 as the two nothing has ever styled", () => {
    mount();
    expect(button("H5")?.textContent).toContain("*");
    expect(button("H4")?.textContent).not.toContain("*");
    click(button("H5"));
    // The note used to say "the one heading level" while the list holds two,
    // and that nothing had ever styled it — false on a sales page, where a
    // heading block gives h5 a size of its own.
    expect(document.body.textContent).toContain("h5 and h6 are the two heading levels");
    expect(document.body.textContent).toContain(HEADING_SIZE.h5);
    click(button("H4"));
    expect(document.body.textContent).not.toContain("h5 and h6 are the two heading levels");
  });

  it("says a length will be dropped rather than dropping it silently", () => {
    mount();
    // "18" has no unit, so the schema turns it into "". A panel that showed
    // nothing would be a setting that does nothing for no stated reason.
    type("Size", "18");
    expect(document.body.textContent).toContain("Not a length — dropped on save");
    type("Size", "18px");
    expect(document.body.textContent).not.toContain("Not a length — dropped on save");
    // Line height is the one that is allowed to be unitless.
    type("Line height", "1.5");
    expect(document.body.textContent).not.toContain("Not a length — dropped on save");
  });

  it("draws the specimen at the width being edited, with no media query", () => {
    mount();
    click(button("H1"));
    type("Size", "48px");
    click(button("Mobile"));
    type("Size", "28px");

    const css = [...document.querySelectorAll("style")].map((s) => s.textContent ?? "").join("");
    expect(css).toContain(".site-type h1{font-size:48px}");
    expect(css).toContain(".site-type h1{font-size:28px}");
    // A `max-width:767px` query never matches a box a few hundred pixels wide
    // inside a full window, so the phone view would have shown desktop type.
    expect(css).not.toContain("@media");
  });
});

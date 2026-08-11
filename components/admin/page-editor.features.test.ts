import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Every behaviour the sales page editor had before it was rearranged.
 *
 * A redesign is where features go missing, because nobody is counting — the
 * page looks better, ships, and three weeks later someone asks where the
 * template button went. This is the count. Each entry names a thing the old
 * editor did and asserts it still happens somewhere.
 *
 * These are deliberately assertions about the SOURCE rather than about
 * rendering: several of them are behaviours (scroll-into-view, one-write-per
 * -section, aria-live) that a static render cannot show, and a redesign that
 * quietly dropped one would otherwise pass a test suite full of green.
 */

const editor = readFileSync("components/admin/page-editor.tsx", "utf8");
const route = readFileSync("app/admin/products/[id]/page-editor/page.tsx", "utf8");
const both = editor + route;

const has = (needle: string) => expect(both, needle).toContain(needle);

describe("saving", () => {
  it("still writes one section at a time", () => {
    // What stops a save of one section discarding another.
    has("for (const key of dirtyKeys)");
    has("saveSectionAction");
  });

  it("still sends only the sections that changed", () => {
    has("dirtyKeys");
  });

  it("still counts the changes on the button", () => {
    has("Save ${dirtyKeys.length} change");
  });

  it("still stops at the first failure and names the section", () => {
    // A save that carries on past an error leaves you unsure what was written.
    has("setSaveError(");
    has("def?.title ?? row.sectionKey");
  });

  it("still announces the result to a screen reader", () => {
    has('aria-live="polite"');
  });

  it("still merges the section's defaults into what it writes", () => {
    // A section that has never been opened has no stored content; sending only
    // what is in state would write an empty band over the default one.
    has("...def?.defaults");
  });
});

describe("the page-level warnings and helpers", () => {
  it("still warns when nothing on the page can be bought", () => {
    // The page renders perfectly and converts at zero; nothing else notices.
    has("warnNotBuyable");
    has("Nothing on this page can be bought");
  });

  it("still explains how to fix it", () => {
    has("What it does");
    has("Buy button");
  });

  it("still offers the starter, and only on a blank page", () => {
    // Offering it over work someone has done would be a button that destroys a
    // page.
    has("pageIsBlank");
    has("fillFromStarter");
    has("Start from the template");
  });

  it("still switches the preview between devices", () => {
    has("DeviceSwitch");
  });

  it("still links to the whole page as buyers see it", () => {
    has("liveHref");
  });
});

describe("what the route provides", () => {
  it("still shows the public link, with the copy button", () => {
    has("CopyLink");
  });

  it("still says the link only goes live once something is saved", () => {
    has("Live as soon as you save any section");
  });

  it("still offers page-level custom CSS and JS", () => {
    has("PageSettings");
  });

  it("still escapes the admin column so the preview has real width", () => {
    // The hero goes side-by-side at 768px; a narrower pane previewed every
    // section as its narrow layout.
    has("100vw-var(--admin-nav)");
  });

  it("still passes the real price into the preview", () => {
    has("priceLabel");
  });
});

describe("each section", () => {
  it("still shows its number and name", () => {
    has("def.n");
    has("def.title");
  });

  it("still shows its band colour", () => {
    has("BAND_STYLES");
  });

  it("still shows whether it is unsaved or saved", () => {
    has("Unsaved");
    has("Saved");
  });

  it("still shows whether a section is switched off", () => {
    // Deliberately replaced rather than dropped: an "Off" pill became a switch
    // that says its own state, with the name struck through beside it. A pill
    // reporting a checkbox two columns away was the weaker of the two.
    expect(editor).toContain("aria-checked={row.enabled}");
    expect(editor).toContain("line-through");
  });

  it("still explains what the section is for", () => {
    has("def.purpose");
  });

  it("still opens the block editor for that section", () => {
    has("BlockCanvasField");
  });

  it("still previews with the component the live page uses", () => {
    // Not a mock-up, so it cannot drift from what buyers see.
    has("SectionBand");
    has("not a mock-up");
  });

  it("still says which width the preview is showing", () => {
    has("DEVICE_CANVAS[device]");
  });

  it("still carries the section's own settings into the block editor", () => {
    // Band colour, accent, width and whether it shows. `variants` used to be
    // in this list and is not any more: nothing has rendered from a section's
    // variant since the page became blocks, so the control it fed was a switch
    // wired to nothing.
    has("layout: row.layout ?? null");
    has("enabled: row.enabled");
  });
});

describe("what the redesign added", () => {
  it("puts every section on screen at once", () => {
    expect(editor).toContain("SectionRail");
  });

  it("makes the on/off switch a switch", () => {
    // It was an unlabelled checkbox — the most consequential control on the
    // page and the least explained.
    expect(editor).toContain('role="switch"');
  });

  it("numbers the sections in the order they appear", () => {
    // The stored numbering is 1 + 2, 3 … 9, 9, +, 10, + — it describes the
    // framework the sections came from, and on screen it reads as a bug.
    expect(editor).toContain("i + 1");
  });

  it("names a section that will not render", () => {
    expect(editor).toContain("Empty");
  });
});

describe("the switch works and reads as a switch", () => {
  it("is green when the section is shown, grey when it is not", () => {
    // The brand colour is what actions are; this is a state. A rust pill next
    // to a rust Save button says the same thing about two different kinds of
    // thing.
    expect(editor).toContain('row.enabled ? "bg-[#3f9b6d]" : "bg-border"');
  });

  it("keeps its knob inside the track", () => {
    // w-7 with a 12px knob and translate-x-3.5 put the knob's right edge
    // exactly on the track's, so it spilled out and read as broken.
    expect(editor).toContain("w-8");
    expect(editor).toContain("size-3.5");
    expect(editor).toContain('row.enabled ? "translate-x-3.5" : "translate-x-0"');
  });

  it("says which state it is in on hover", () => {
    expect(editor).toContain("Shown on the page");
  });
});

describe("the band swatch is not mistaken for a checkbox", () => {
  it("is a ringed circle rather than a bare square", () => {
    // The paper band is #ffffff, so an unringed square beside a name is
    // indistinguishable from an empty checkbox.
    expect(editor).toContain("rounded-full ring-1 ring-inset");
  });
});

describe("the section bar says one thing once", () => {
  it("does not repeat the heading beside itself", () => {
    // BlockCanvasField used to render "Content", a block count and a paragraph
    // about dragging, directly beside a bar naming the same section.
    expect(editor).not.toContain(">\n        Content\n");
    expect(editor).toContain("Edit blocks");
  });
});

describe("the page above the sections", () => {
  const productRoute = readFileSync("app/admin/products/[id]/page-editor/page.tsx", "utf8");
  const offerRoute = readFileSync("app/admin/offers/[id]/page-editor/page.tsx", "utf8");

  it.each([
    ["product", productRoute],
    ["offer", offerRoute],
  ])("folds the link and the code away on the %s editor", (_which, src) => {
    // A heading, a paragraph explaining what a sales page is, a card for a URL
    // and a card for code that is empty — five hundred pixels before section
    // one.
    expect(src).toContain("Public link &amp; custom code");
    expect(src).toContain("<details");
  });

  it.each([
    ["product", productRoute],
    ["offer", offerRoute],
  ])("keeps both of them reachable on the %s editor", (_which, src) => {
    expect(src).toContain("CopyLink");
    expect(src).toContain("PageSettings");
  });
});

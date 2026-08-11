import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  PRODUCT_FIELD_TABS,
  summarise,
  tabToShow,
  tabsWithErrors,
} from "@/lib/save-feedback";

// Three ways a save failed silently.

describe("moving to the tab that has the problem", () => {
  it("goes there when the message is out of sight", () => {
    // Press Save on Basics with no price and the explanation renders on
    // Pricing, which you are not looking at.
    expect(tabToShow({ price: "Price required" }, PRODUCT_FIELD_TABS, "basics", "basics")).toBe(
      "pricing",
    );
  });

  it("stays put when the message is already on screen", () => {
    // Yanking someone to another tab to show them what they can already see is
    // a page that moves under them for no reason.
    expect(tabToShow({ title: "Title required" }, PRODUCT_FIELD_TABS, "basics", "basics")).toBeNull();
  });

  it("stays put when one of several is on screen", () => {
    const errs = { title: "Required", price: "Required" };
    expect(tabToShow(errs, PRODUCT_FIELD_TABS, "basics", "basics")).toBeNull();
  });

  it("does nothing when nothing is wrong", () => {
    expect(tabToShow({}, PRODUCT_FIELD_TABS, "basics", "basics")).toBeNull();
    expect(tabToShow(undefined, PRODUCT_FIELD_TABS, "basics", "basics")).toBeNull();
  });

  it("ignores a key whose message is empty", () => {
    // Editing a field clears its message to "" rather than removing the key.
    expect(tabToShow({ price: "" }, PRODUCT_FIELD_TABS, "basics", "basics")).toBeNull();
  });

  it("falls back for a field nobody mapped", () => {
    expect(tabToShow({ mystery: "Bad" }, PRODUCT_FIELD_TABS, "pricing", "basics")).toBe("basics");
  });
});

describe("which tabs get a dot", () => {
  it("marks every tab holding a problem", () => {
    const out = tabsWithErrors(
      { title: "Required", price: "Required", courseIds: "Needed" },
      PRODUCT_FIELD_TABS,
      "basics",
    );
    expect([...out].sort()).toEqual(["basics", "content", "pricing"]);
  });

  it("does not blame a tab for a whole-form problem", () => {
    // "_form" is the save failing, not one field being wrong.
    expect(tabsWithErrors({ _form: "Save failed" }, PRODUCT_FIELD_TABS, "basics").size).toBe(0);
  });
});

describe("saying what is wrong", () => {
  it("names one field", () => {
    expect(summarise({ price: "Required" })).toBe("Price needs fixing");
  });

  it("names several", () => {
    // "2 problems" sends you looking; the names tell you what to fix.
    expect(summarise({ title: "x", price: "y" })).toBe("Title and Price need fixing");
  });

  it("puts a whole-form failure first", () => {
    expect(summarise({ price: "Required", _form: "Database unreachable" })).toBe(
      "Database unreachable",
    );
  });

  it("says nothing when nothing is wrong", () => {
    expect(summarise({})).toBeNull();
    expect(summarise(undefined)).toBeNull();
  });
});

describe("no form can block itself silently", () => {
  const FORMS = [
    "components/admin/product-form.tsx",
    "components/admin/offer-form.tsx",
    "components/admin/course-form.tsx",
  ];

  it.each(FORMS)("%s turns off the browser's own validation", (file) => {
    // The browser refuses to submit a form holding an invalid control it cannot
    // focus, and reports it only to the console. With fields spread over tabs
    // that made the Save button do nothing at all, forever.
    const src = readFileSync(file, "utf8");
    if (!src.includes("required")) return;
    expect(src, file).toContain("noValidate");
  });

  it.each(FORMS)("%s checks the required fields itself", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/clientErrors|function check\(/);
  });
});

describe("a save always ends somewhere visible", () => {
  it.each([
    ["product", "components/admin/product-form.tsx"],
    ["offer", "components/admin/offer-form.tsx"],
  ])("%s says saved, and stops saying unsaved", (_which, file) => {
    // "Unsaved" left on screen after a save that worked is indistinguishable
    // from a save that did not happen.
    const src = readFileSync(file, "utf8");
    expect(src).toContain("useJustSaved(state.saved)");
    expect(src).toContain("setDirty(false)");
  });

  it.each([
    ["product", "components/admin/product-form.tsx"],
    ["offer", "components/admin/offer-form.tsx"],
    ["course", "components/admin/course-form.tsx"],
    ["settings", "components/admin/settings-screen.tsx"],
    ["member", "components/admin/add-member.tsx"],
  ])("%s admits when it is taking too long", (_which, file) => {
    expect(readFileSync(file, "utf8")).toContain("useSlowSave");
  });

  it("stops redirecting an update onto the page it is already on", () => {
    // Re-rendering everything to arrive where it started, with the button
    // saying "Saving…" for the length of it.
    const src = readFileSync("app/admin/actions.ts", "utf8");
    expect(src).toContain("if (!id) redirect(");
    expect(src).toContain("return { saved: true }");
  });
});

describe("an upload cannot hang forever", () => {
  const src = readFileSync("components/admin/media-modal.tsx", "utf8");

  it("gives up rather than showing Uploading… for good", () => {
    expect(src).toContain("AbortController");
    expect(src).toContain("AbortError");
  });

  it("survives a failure that is not JSON", () => {
    // A proxy rejecting the size answers in HTML, and parsing that throws where
    // a message was wanted.
    expect(src).toContain("res.json().catch(() => ({}))");
  });
});

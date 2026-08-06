import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { EditorTabs, TabPanel } from "@/components/admin/editor-tabs";
import { StorefrontPreview, BumpPreview, Readiness } from "@/components/admin/editor-preview";

// The save button used to be two thousand pixels below the field you had just
// changed, and nothing on the page said whether the thing could be sold.

describe("tabs inside a form", () => {
  const shell = () =>
    renderToStaticMarkup(
      <EditorTabs tabs={[{ key: "a", label: "Basics" }, { key: "b", label: "Pricing" }]}>
        <TabPanel tab="a">
          <input name="title" defaultValue="kept" />
        </TabPanel>
        <TabPanel tab="b">
          <input name="price" defaultValue="4.99" />
        </TabPanel>
      </EditorTabs>,
    );

  it("keeps every field in the document, including the hidden ones", () => {
    // A form posts the inputs that are MOUNTED. A tab that unmounted its
    // fields would silently drop them: change the price, save from Basics, and
    // the price goes back to what it was with no error anywhere.
    const out = shell();
    expect(out).toContain('name="title"');
    expect(out).toContain('name="price"');
    expect(out).toContain('value="4.99"');
  });

  it("hides rather than removes the inactive panel", () => {
    expect(shell()).toContain("hidden");
  });

  it("marks a tab that needs attention", () => {
    const out = renderToStaticMarkup(
      <EditorTabs tabs={[{ key: "a", label: "Basics" }, { key: "b", label: "Funnel", attention: true }]}>
        <TabPanel tab="a">x</TabPanel>
      </EditorTabs>,
    );
    expect(out).toContain("needs attention");
  });
});

describe("the preview", () => {
  it("shows what is typed, not what was saved", () => {
    const out = renderToStaticMarkup(
      <StorefrontPreview title="A Title" tagline="A line" price="4.99" coverUrl={null} />,
    );
    expect(out).toContain("A Title");
    expect(out).toContain("A line");
    expect(out).toContain("$4.99");
  });

  it("says untitled rather than rendering an empty card", () => {
    const out = renderToStaticMarkup(
      <StorefrontPreview title="  " tagline="" price="1" coverUrl={null} />,
    );
    expect(out).toContain("Untitled");
  });

  it("refuses to invent a price from nonsense", () => {
    const out = renderToStaticMarkup(
      <StorefrontPreview title="X" tagline="" price="" coverUrl={null} />,
    );
    expect(out).toContain("—");
    expect(out).not.toContain("$0.00");
  });

  it("shows the bump the way a buyer reads it", () => {
    const out = renderToStaticMarkup(
      <BumpPreview headline="Add Content Engine" terms="7 days free, then $29.00/month" />,
    );
    expect(out).toContain("Add Content Engine");
    expect(out).toContain("7 days free");
  });
});

describe("readiness", () => {
  it("counts what is wrong rather than saying nothing", () => {
    const out = renderToStaticMarkup(
      <Readiness
        checks={[
          { ok: true, label: "Price set" },
          { ok: false, label: "Sales page built", detail: "Buyers land on the plain page." },
        ]}
      />,
    );
    expect(out).toContain("1 to sort out");
    expect(out).toContain("Buyers land on the plain page.");
  });

  it("says so when there is nothing wrong", () => {
    const out = renderToStaticMarkup(<Readiness checks={[{ ok: true, label: "Price set" }]} />);
    expect(out).toContain("Ready to sell");
  });

  it("explains only what is missing", () => {
    // A detail under something already done is noise.
    const out = renderToStaticMarkup(
      <Readiness checks={[{ ok: true, label: "Price set", detail: "should not appear" }]} />,
    );
    expect(out).not.toContain("should not appear");
  });
});

describe("the product form uses the shell", () => {
  const src = readFileSync("components/admin/product-form.tsx", "utf8");
  const header = readFileSync("components/admin/editor-header.tsx", "utf8");

  it("puts save where the work is", () => {
    // In the header row now, which is one component both editors use.
    expect(src).toContain("<EditorHeader");
    expect(header).toContain("sticky top-0");
    expect(header).toContain("Unsaved");
  });

  it("says when something is not ready, from any tab", () => {
    expect(src).toContain("{notReady} to sort out");
  });

  it("carries the cover with the form rather than uploading on its own", () => {
    // It was its own <form>, which is why it needed a card outside the tabs and
    // could never be one save with everything else.
    expect(src).toContain('name="mediaId"');
    expect(src).toContain('name="clearCover"');
  });

  it("no longer wraps every group in a card", () => {
    // A border around a group of fields separates it from a group of fields.
    expect(src).not.toContain("<Section");
    expect(src).toContain("<Group");
  });

  it("keeps Delete away from Save", () => {
    // They are not peers and should not be adjacent.
    const save = src.indexOf('{pending ? "Saving…"');
    // The usage, not the import at the top of the file.
    const del = src.indexOf("formAction={removeProduct}");
    expect(del).toBeGreaterThan(save);
  });
});

describe("the offer form uses the same shell", () => {
  const src = readFileSync("components/admin/offer-form.tsx", "utf8");

  it("is the same five-tab shape", () => {
    // One component, two things to edit — not two similar forms.
    expect(src).toContain("EditorTabs");
    expect(src).toContain('key: "basics"');
    expect(src).toContain('key: "pricing"');
    expect(src).toContain('key: "marketing"');
  });

  it("saves from the top, like the product editor", () => {
    expect(src).toContain("sticky top-0");
    expect(src).toContain("Unsaved");
  });

  it("keeps Active where it can be seen", () => {
    // It decides whether the offer can be attached at all, and it used to be a
    // lone checkbox below every section.
    const bar = src.indexOf("sticky top-0");
    const activeBox = src.indexOf('name="active"');
    expect(activeBox).toBeGreaterThan(bar);
    expect(activeBox - bar).toBeLessThan(900);
  });

  it("keeps every field mounted across the tabs", () => {
    // The same trap: a form posts what is mounted, and an offer has fields on
    // five tabs.
    expect(src).toContain("TabPanel");
    expect(src).not.toContain("{active === ");
  });
});

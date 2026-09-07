// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DuplicateButton } from "@/components/admin/duplicate-button";

describe("duplicating from the editor", () => {
  it("suggests a key rather than making the person invent one", () => {
    const html = renderToStaticMarkup(
      <DuplicateButton kind="offer" id="o1" currentKey="content-engine" />,
    );
    expect(html).toContain("content-engine-copy");
  });

  it("carries which record is being copied", () => {
    const html = renderToStaticMarkup(<DuplicateButton kind="offer" id="o1" currentKey="x" />);
    expect(html).toContain('value="o1"');
    expect(html).toContain('value="offer"');
  });

  it("says the copy arrives switched off", () => {
    // Otherwise the first thing anyone does is wonder whether they have just
    // put a half-finished duplicate of their best seller on the storefront.
    const html = renderToStaticMarkup(<DuplicateButton kind="product" id="p1" currentKey="guide" />);
    expect(html).toMatch(/draft|switched off|not live/i);
  });
});

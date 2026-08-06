import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { ViewLive } from "@/components/admin/view-live";

// Editing a sales page and looking at one are different jobs, and going from
// the first to the second meant typing the URL from memory.

describe("the link to the live page", () => {
  it("opens the buyer's URL", () => {
    const out = renderToStaticMarkup(<ViewLive href="/p/viral-carousels" />);
    expect(out).toContain('href="/p/viral-carousels"');
  });

  it("opens in a new tab", () => {
    // Losing your place in a form to check a heading is a punishment for
    // checking.
    expect(renderToStaticMarkup(<ViewLive href="/p/x" />)).toContain('target="_blank"');
  });

  it("does not hand the new tab a reference back", () => {
    expect(renderToStaticMarkup(<ViewLive href="/p/x" />)).toContain('rel="noopener noreferrer"');
  });

  it("stops being a link when it would land on a 404", () => {
    // A link that goes nowhere teaches you not to trust the next one.
    const out = renderToStaticMarkup(
      <ViewLive href="/p/x" unavailable="published products only" />,
    );
    expect(out).not.toContain("<a");
    expect(out).toContain("published products only");
  });
});

describe("where it appears", () => {
  it("sits in the product editor's header", () => {
    // The header row absorbed the heading block, the two link buttons and the
    // cover card. ViewLive itself still guards the offer editor.
    const src = readFileSync("app/admin/products/[id]/page.tsx", "utf8");
    expect(src).toContain("liveHref=");
    expect(src).toContain('product.status === "published"');
  });

  it("knows both ways an offer page can be unreachable", () => {
    // The offer switched off, or the page never built. Either is a 404.
    const src = readFileSync("app/admin/offers/[id]/page.tsx", "utf8");
    expect(src).toContain("the offer is switched off");
    expect(src).toContain("no sales page built yet");
    expect(src).toContain("`/o/${offer.key}`");
  });

  it("offers a preview for the upsell, which has no public URL", () => {
    // It is only ever reached mid-checkout with a signed token.
    const src = readFileSync("app/admin/offers/[id]/page.tsx", "utf8");
    expect(src).toContain("/oto-preview/${offer.id}");
  });
});

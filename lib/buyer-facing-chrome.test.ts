import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Three small things a buyer sees, each wrong for its own reason.
 */

describe("a bump's bullets are one list, in order", () => {
  const src = readFileSync("components/checkout/order-bump.tsx", "utf8");

  it("does not lay them out in two columns", () => {
    // A grid fills row-wise, so two columns put bullets 1, 3, 5 down the left
    // while the eye reads 1, 2, 3 — and uneven bullets ended the columns at
    // different heights, which read as two separate lists.
    const list = src.slice(src.indexOf("view.bullets.length > 0"), src.indexOf("view.note"));
    expect(list).not.toContain("grid-cols-2");
    expect(list).toContain("flex-col");
  });
});

describe("a course's type is not shown to buyers", () => {
  // It read the COURSE's format and printed it on the PRODUCT, which is not the
  // same thing: a product can bundle several courses or grant an app, and then
  // the label is simply wrong — "READING" on a card for an interactive tool.
  it("is off the storefront card", () => {
    const src = readFileSync("components/product-card.tsx", "utf8");
    expect(src).not.toContain("meta.label");
  });

  it("is off the product's sales page", () => {
    const src = readFileSync("app/(store)/p/[slug]/page.tsx", "utf8");
    expect(src).not.toContain("TYPE_LABEL");
  });

  it("keeps the wash behind the cover", () => {
    // That is a colour, not a claim, and it is what stops a card with no
    // artwork reading as a blank box.
    const src = readFileSync("components/product-card.tsx", "utf8");
    expect(src).toContain("meta.wash");
  });

  it("stays in the admin, where it is useful", () => {
    const form = readFileSync("components/admin/course-form.tsx", "utf8");
    expect(form).toContain('name="type"');
  });
});

describe("a course says whether it is published, where you can act on it", () => {
  const form = readFileSync("components/admin/course-form.tsx", "utf8");
  const layout = readFileSync("app/admin/courses/[id]/(tabs)/layout.tsx", "utf8");

  it("puts Status in the first section, not under vocabulary", () => {
    // It sat beside the Type select under "Format & vocabulary", which is where
    // nobody looked — so people concluded the course was stuck on Draft.
    // Against the SECTION, not the comment that mentions it by name.
    expect(form.indexOf('id="status"')).toBeLessThan(form.indexOf('title="Format & vocabulary"'));
  });

  it("draws a draft in a colour that is not the furniture", () => {
    // Grey is what everything else on the page is. Draft is the state that
    // surprises people, and a surprise in the furniture's colour is decoration.
    expect(layout).not.toContain("bg-surface-2 text-muted");
    expect(layout).toContain("bg-primary/12 text-primary");
  });

  it("links the badge to the control", () => {
    // Somebody who has just noticed the word "Draft" is somebody looking for
    // the way to change it.
    expect(layout).toContain("/details#status");
  });

  it("says what the state means rather than only naming it", () => {
    expect(layout).toContain("Hidden from students");
    expect(form).toContain("Hidden from students");
  });
});

describe("an order line says what was bought", () => {
  it("uses the name in the checkout summary, not the pitch", () => {
    // "Yes I want! 150 Digital Product Ideas Your Clients Are Waiting to Buy"
    // is an advert. In a line item it reads as though the shop does not know
    // what it just sold you.
    const src = readFileSync("components/checkout/slots.tsx", "utf8");
    const summary = src.slice(src.indexOf("export function OrderSummarySlot"), src.indexOf("export function CouponSlot"));
    expect(summary).toContain("c.chosenBump.name");
    expect(summary).not.toContain("c.chosenBump.headline");
  });

  it("keeps the pitch on the bump card, where it belongs", () => {
    const bump = readFileSync("components/checkout/order-bump.tsx", "utf8");
    expect(bump).toContain("view.headline");
  });

  it("was already right in the receipt and the welcome email", () => {
    // Both read order_items.description, and the bump has always recorded the
    // offer's NAME there — so only the live summary was quoting the advert.
    const checkout = readFileSync("lib/checkout.ts", "utf8");
    expect(checkout).toContain("description: offer.name");
  });

  it("carries a name for a product-backed placement too", () => {
    const sellable = readFileSync("lib/sellable.ts", "utf8");
    expect(sellable).toContain("name: product.title");
  });
});

describe("the library card drops the badge as well", () => {
  const src = readFileSync("components/library/course-card.tsx", "utf8");

  it("shows no type label", () => {
    expect(src).not.toContain("meta.label");
  });

  it("keeps the wash", () => {
    expect(src).toContain("meta.wash");
  });
});

describe("pressing Account when signed out", () => {
  const src = readFileSync("app/(store)/account/page.tsx", "utf8");

  it("goes to the login rather than a page about the login", () => {
    // It was a page saying "log in to reach your account" above a button that
    // went to the login — a step that asks somebody to read a sentence and
    // press a thing to be told what they already asked for. Pressing Account
    // IS the request.
    expect(src).toContain('redirect("/login?next=/account")');
    expect(src).not.toContain("Log in to reach your library");
  });

  it("brings them back to the account, not the library", () => {
    // They pressed Account. The login validates `next` starts with a slash, so
    // it cannot be pointed off-site.
    const login = readFileSync("app/(store)/login/page.tsx", "utf8");
    expect(login).toContain('next?.startsWith("/")');
  });

  it("matches what the library already did", () => {
    const lib = readFileSync("app/(store)/library/page.tsx", "utf8");
    expect(lib).toContain('redirect("/login")');
  });
});

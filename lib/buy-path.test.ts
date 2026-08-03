import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Which buy control each surface uses.
//
// The rule: a sales page someone lands on cold links to a checkout, because
// there is no card on file and no order to attach to. The upsell is one click,
// because the card was saved moments earlier and asking for it again is how an
// upsell loses the sale it just earned.
//
// These read the real files, because the failure is silent in both directions:
// a link on the upsell means re-entering a card that is already saved, and a
// one-click form on a cold page means charging someone who never gave one.

const read = (p: string) => readFileSync(p, "utf8");

describe("the buy control matches the surface", () => {
  it("sends a cold visitor on a product page to the checkout", () => {
    const page = read("app/(store)/p/[slug]/page.tsx");
    expect(page).toContain("/checkout?product=");
    // No accept action: there is no order and no saved card to accept with.
    expect(page).not.toContain("acceptOtoAction");
    expect(page).not.toContain("OtoActions");
  });

  it("sends a cold visitor on an offer page to the offer checkout", () => {
    const page = read("app/(store)/o/[key]/page.tsx");
    expect(page).toContain("/checkout/offer?offer=");
    expect(page).not.toContain("OtoActions");
  });

  it("keeps the upsell one click, on the card already saved", () => {
    const tpl = read("components/oto/sections-template.tsx");
    // OtoActions owns the form, the token and the server action. A template
    // may restyle the button and rename it; it may not reinvent the payment.
    expect(tpl).toContain("OtoActions");
    expect(tpl).toContain("view.token");
    expect(tpl).not.toMatch(/href=.*\/checkout/);
  });

  it("keeps the accept path in one place for every upsell layout", () => {
    // If a layout builds its own form, the single-use token and the replay
    // guard stop being enforced for that layout only — the worst kind of gap,
    // because the other layouts still look correct.
    const shell = read("components/oto/shell.tsx");
    expect(shell).toContain("acceptOtoAction");
    for (const f of [
      "components/oto/sections-template.tsx",
      "components/oto/templates.tsx",
      "components/oto/sales-template.tsx",
      "components/oto/custom/content-engine.tsx",
    ]) {
      expect(read(f), `${f} builds its own accept form`).not.toContain("acceptOtoAction");
    }
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("app/admin/offers/[id]/page.tsx", "utf8");
const columns = readFileSync("lib/store.ts", "utf8");

// The offer form is uncontrolled — every field is `defaultValue`. React ignores
// defaultValue on re-render, so after a save the inputs keep whatever the DOM
// holds rather than what the server stored. That is invisible until the two
// disagree, which they do whenever saveOffer corrects the input: it drops
// channels the granting app does not declare, and bumpSlotError refuses a bump.
// The admin then sees their own rejected value sitting there as though it saved.
//
// A `key` that changes when the row changes forces React to remount the form
// against fresh props. It has to come from the row, not from a counter — a
// counter would remount on a failed save too, discarding what they typed.
describe("the offer form shows what was stored, not what was typed", () => {
  it("remounts on a key taken from the offer's own updated_at", () => {
    const rendered = page.slice(page.indexOf("<OfferForm"), page.indexOf("<OfferForm") + 200);
    // Fails closed: if the tag moves or is renamed, this slice is empty or
    // wrong and the positive assertion below goes red rather than vacuous.
    expect(rendered).toContain("offer={offer}");
    expect(rendered).toMatch(/key=\{[^}]*updatedAt/);
  });

  it("reads updated_at, or the key would be undefined on every render", () => {
    // An undefined key is a constant key: React reuses the tree and the
    // remount never happens, silently.
    expect(columns).toMatch(/OFFER_COLUMNS[\s\S]{0,600}updated_at/);
  });
});

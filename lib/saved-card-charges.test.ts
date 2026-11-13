import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every place the store can charge a card, by the function that does it.
 *
 * The library's "Still available" card charged the saved card on one tap,
 * and nine buyers started a second subscription that way before anyone
 * decided they should (1 Oct 2026). The owner's rule since: one tap on a
 * saved card is for the upsell only; every other purchase goes through a
 * sales page and the checkout.
 *
 * This is an inventory, not a behaviour test. It fails when a NEW place
 * starts charging, so that place reaches a person who can say yes or no,
 * and the list below is where the answer is written down. Removing a place
 * fails it too: update the list in the same change.
 */

const ALLOWED = new Set([
  // The checkout page: the buyer is entering a card and pressing Pay.
  "lib/checkout.ts › createCheckoutIntent › paymentIntents.create(",
  "lib/checkout.ts › finalizeOrder › subscriptions.create(",
  "lib/checkout.ts › finalizeOrder › fulfilBump(",
  "lib/offer-checkout.ts › startOfferCheckout › paymentIntents.create(",
  "lib/offer-checkout.ts › completeOfferCheckout › fulfilOffer(",
  "lib/offer-checkout.ts › completeOfferCheckout › fulfilBump(",
  // The engine both checkouts and the upsell share.
  "lib/checkout.ts › fulfilOffer › subscriptions.create(",
  "lib/checkout.ts › fulfilOffer › paymentIntents.create(",
  "lib/checkout.ts › fulfilBump › fulfilOffer(",
  // The upsell, one page after paying: the one place a saved card is charged on one tap.
  "lib/checkout.ts › acceptOto › fulfilOffer(",
  // A bump that failed at checkout, retried by the queue. Ticked at checkout by the buyer.
  "lib/retry.ts › bump_charge › fulfilBump(",
]);

const PATTERNS = ["fulfilOffer(", "fulfilBump(", "paymentIntents.create(", "subscriptions.create(", "invoices.pay("];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : files(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

/** The nearest enclosing named function, or the runner key in an object of runners. */
function enclosing(lines: string[], at: number): string {
  for (let i = at; i >= 0; i--) {
    const m = lines[i].match(/(?:async\s+)?function\s+(\w+)\s*[(<]/) ?? lines[i].match(/^\s{2}(\w+):\s*async\b/);
    if (m) return m[1];
  }
  return "(top level)";
}

function chargeSites(): Set<string> {
  const found = new Set<string>();
  for (const f of ["app", "lib", "components"].flatMap(files)) {
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "");
      if (/^\s*\*/.test(code)) return;
      for (const p of PATTERNS) {
        if (!code.includes(p)) continue;
        // The definition itself is not a call.
        if (new RegExp(`function\\s+${p.replace("(", "\\(")}`).test(code)) continue;
        found.add(`${f} › ${enclosing(lines, i)} › ${p}`);
      }
    });
  }
  return found;
}

describe("places that can charge a card", () => {
  it("are exactly the ones the owner has agreed to", () => {
    expect([...chargeSites()].sort()).toEqual([...ALLOWED].sort());
  });
});

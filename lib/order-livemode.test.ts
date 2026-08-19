import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Telling a test purchase from a real one.
 *
 * Two orders in production are test-mode purchases: real rows, marked paid,
 * for money that never moved. They were made while the store was still on a
 * test key and nothing recorded that — so they counted towards revenue, sat in
 * the members' purchase history, and held subscription ids Stripe answers for
 * with "No such subscription; a similar object exists", its phrasing for an id
 * that lives in the other mode. Those two will never renew and never cancel,
 * because as far as live Stripe is concerned they do not exist.
 *
 * Deleting them loses the record of a real test. Marking them says what they
 * are, which is what anybody reading the orders list needs.
 */

const migration = readFileSync("supabase/migrations/0063_order_livemode.sql", "utf8");
const checkout = readFileSync("lib/checkout.ts", "utf8");
const offer = readFileSync("lib/offer-checkout.ts", "utf8");
const renewals = readFileSync("lib/renewals.ts", "utf8");
const orders = readFileSync("lib/orders.ts", "utf8");
const members = readFileSync("lib/members.ts", "utf8");
const row = readFileSync("components/admin/order-row.tsx", "utf8");

describe("the column", () => {
  it("defaults to live, because the rest of the table is", () => {
    expect(migration).toContain("add column if not exists livemode boolean not null default true");
  });

  it("names the two, and says how they were identified", () => {
    expect(migration).toContain("sub_1Twx0hKjvA6KCUXm8Dln9c54");
    expect(migration).toContain("sub_1TyCRZKjvA6KCUXmB0wfLoDP");
    expect(migration).toContain("a similar object exists");
  });

  it("finds them through order_items, where a subscription id is written", () => {
    expect(migration).toMatch(/from order_items i[\s\S]{0,120}i\.order_id = o\.id/);
  });
});

describe("every order written from now on", () => {
  it("records the mode it was made in", () => {
    // Both product inserts — the trial one and the charged one.
    expect(checkout.match(/livemode: stripeMode\(\) === "live"/g)!.length).toBe(2);
    expect(offer).toContain('livemode: stripeMode() === "live"');
  });

  it("takes a renewal's mode from the invoice itself", () => {
    // Stripe stamps every object with its own mode, which is a better answer
    // than whichever key we happen to be holding when the webhook arrives.
    expect(renewals).toContain("livemode: invoice.livemode !== false");
  });
});

describe("what it changes", () => {
  it("is readable without another query", () => {
    expect(orders).toContain("livemode,");
    expect(orders).toContain("livemode: (o.livemode as boolean) !== false");
  });

  it("keeps money that never moved out of what a member has spent", () => {
    expect(members).toContain("livemode?: boolean }).livemode !== false");
    // Still counted as a purchase, because it did happen.
    expect(members).toContain("Left in the count of purchases");
  });

  it("is visible in the orders list rather than only in the database", () => {
    expect(row).toContain("!order.livemode &&");
    expect(row).toContain("line-through");
  });
});

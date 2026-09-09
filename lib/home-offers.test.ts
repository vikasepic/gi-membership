import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * Which offers reach the storefront.
 *
 * The rule was "every active RECURRING offer, cheapest first" — invisible and
 * unchangeable. Splitting Content Engine into three channel offers put all
 * three on the home page the day they went active, and a one-time offer could
 * never appear however much it belonged there.
 */
const store = readFileSync("lib/store.ts", "utf8");
const home = store.slice(store.indexOf("export async function listHomeOffers"));
const body = home.slice(0, home.indexOf("\n}") + 2);

describe("the storefront's offer list", () => {
  it("selects on the admin's number, not on how the offer bills", () => {
    expect(body).toContain('.not("home_order", "is", null)');
    expect(body, "billing type must not decide what the storefront shows").not.toContain(
      'billing_type',
    );
  });

  it("shows them in the order the admin set", () => {
    expect(body).toContain('.order("home_order", { ascending: true })');
  });

  it("breaks a tie by id, so two offers at one position cannot swap between reads", () => {
    // The same rule getStandingOffer had to learn: an unordered pick over a
    // shared store returns whichever row Postgres felt like.
    expect(body).toContain('.order("id", { ascending: true })');
  });

  it("still refuses an inactive offer", () => {
    expect(body).toContain('.eq("active", true)');
  });

  it("is what the storefront and its preview both call", () => {
    for (const f of ["app/(store)/page.tsx", "lib/storefront-preview.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} should read the placement list`).toContain("listHomeOffers");
      expect(src, `${f} still calls the old rule`).not.toContain("listSubscriptionOffers");
    }
  });
});

describe("the migration that introduces it", () => {
  const sql = readFileSync("supabase/migrations/0076_offer_home_order.sql", "utf8");

  it("defaults to not-shown, so appearing on the storefront is a choice", () => {
    expect(sql).toContain("add column if not exists home_order integer");
    expect(sql).not.toMatch(/home_order integer[^;]*default \d/i);
  });

  it("refuses a position below 1", () => {
    expect(sql).toMatch(/check \(home_order is null or home_order > 0\)/);
  });

  it("seeds exactly what the old rule showed, so the deploy changes nothing", () => {
    // Without this every storefront goes blank on deploy and stays blank until
    // someone numbers them by hand — a worse default than the rule replaced.
    expect(sql).toContain("where active and billing_type = 'recurring'");
    expect(sql).toContain("order by price_cents asc");
    expect(sql).toContain("where o.id = ranked.id and o.home_order is null");
  });
});

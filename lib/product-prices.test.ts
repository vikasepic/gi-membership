import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const sql = readdirSync("supabase/migrations")
  .sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
  .join("\n");

const products = sql.slice(sql.indexOf("create table if not exists product_prices"));
const offers = sql.slice(
  sql.indexOf("create table if not exists offer_prices"),
  sql.indexOf("create table if not exists product_prices"),
);

/**
 * Products' ways to pay are offers' ways to pay.
 *
 * Not "similar to" — the same model, the same rules, the same guarantees. Two
 * price models that are ALMOST the same is how a checkout charges one thing
 * and records another, so this file's job is to keep them from drifting apart.
 */
describe("the two price models are the same model", () => {
  it("carries every rule offer_prices carries", () => {
    for (const rule of [
      "recurring_needs_interval",
      "one_time_has_no_trial",
      "compare_at_above_price",
    ]) {
      expect(offers, `offer_prices_${rule}`).toContain(`offer_prices_${rule}`);
      expect(products, `product_prices_${rule}`).toContain(`product_prices_${rule}`);
    }
  });

  it("carries every column", () => {
    for (const col of [
      "billing_type",
      "interval",
      "interval_count",
      "trial_days",
      "price_cents",
      "compare_at_cents",
      "sort_order",
      "archived",
    ]) {
      expect(products, col).toContain(col);
    }
  });

  it("names the constraints rather than writing them inline", () => {
    // An unnamed inline CHECK is invisible in a diff, and this repo has twice
    // shipped a feature the database then refused because of one.
    expect(products).toContain("constraint product_prices_");
  });
});

describe("a price somebody is on cannot vanish", () => {
  it("records which price on ownership and on the order line", () => {
    expect(products).toContain("alter table ownership");
    expect(products).toContain("product_price_id uuid references product_prices(id) on delete restrict");
    expect(products).toContain("alter table order_items");
  });

  it("holds archive-not-delete in the database, not only in the admin", () => {
    // The admin refusing is the polite version; this is the one that holds when
    // a script or a console forgets to ask.
    expect(products.match(/on delete restrict/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

describe("nothing changes for a product that already exists", () => {
  it("backfills every product as the one-off it has always been", () => {
    // `products` has no billing_type column at all, so one_time is not a
    // guess — it is the only thing any product here has ever been.
    expect(products).toContain("insert into product_prices");
    expect(products).toContain("'one_time'");
  });

  it("points existing buyers at the price they bought", () => {
    // Without this the buyer count under-reports, which is how a price
    // somebody is on becomes removable.
    expect(products).toContain("update ownership o set product_price_id");
    expect(products).toContain("update order_items i set product_price_id");
  });

  it("demotes products.price_cents to a mirror with one writer", () => {
    expect(products).toContain("sync_product_default_price");
    expect(products).toContain("order by sort_order, created_at");
    // No price showing must leave the last known one standing: price_cents is
    // NOT NULL, so writing a null would fail a save naming a table the caller
    // never touched.
    expect(products).toContain("if not found then");
  });
});

describe("every reader sees the prices", () => {
  it("embeds them in the one product column list", () => {
    const store = readFileSync("lib/store.ts", "utf8");
    expect(store).toContain("product_prices(id, label, billing_type");
  });

  it("leaves no second hand-written copy to drift", () => {
    // There were three. The library keeps two extra columns of its own, but as
    // a sum rather than a third list.
    for (const f of ["lib/admin.ts", "lib/library.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/const PRODUCT_COLUMNS\s*=\s*\n?\s*"id, slug/);
    }
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { INTERVALS, newOfferPrice, type OfferPrice } from "@/lib/offer-prices";

/**
 * The database's opinion, checked against the code's.
 *
 * This repo has shipped a feature the database then refused twice — once for a
 * layout the dropdown offered and a CHECK rejected, once for an owner_type the
 * type system knew about and a constraint did not. Both times tsc was clean,
 * the tests were green and the build passed, and a person found it.
 *
 * A CHECK constraint is invisible to all three. So this reads the migration and
 * asserts it agrees with the TypeScript, the way lib/oto-template-wiring.test.ts
 * does for the OTO templates.
 */

const SQL = readFileSync("supabase/migrations/0048_offer_prices.sql", "utf8");

/** The values inside `check (col in ('a','b'))`, whatever the whitespace. */
function checkValues(column: string): string[] {
  const m = new RegExp(`${column}\\s+text[^,]*?check\\s*\\(\\s*${column}\\s+in\\s*\\(([^)]+)\\)`, "i").exec(SQL);
  if (!m) throw new Error(`no CHECK found for ${column} — did the column change shape?`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe("what the database will accept", () => {
  it("takes exactly the billing types the type declares", () => {
    const allowed: OfferPrice["billingType"][] = ["one_time", "recurring"];
    expect(checkValues("billing_type").sort()).toEqual([...allowed].sort());
  });

  it("takes exactly the intervals the editor offers", () => {
    // INTERVALS is what fills the dropdown. A fifth one added there and not
    // here is a save that fails with a constraint error naming a table the
    // person was not looking at.
    expect(checkValues("interval").sort()).toEqual([...INTERVALS].sort());
  });

  it("refuses a trial on a one-off, which the editor also refuses", () => {
    // Free trials only, and there is nothing to trial about a single purchase.
    // The editor clears trialDays when the row is switched to one-time; this
    // is the half that holds when something else writes the row.
    expect(SQL).toContain("offer_prices_one_time_has_no_trial");
    expect(newOfferPrice("x").trialDays).toBe(null);
  });

  it("refuses a was-price below the price", () => {
    expect(SQL).toContain("offer_prices_compare_at_above_price");
  });

  it("names every constraint it adds", () => {
    // offers carries this same recurring-needs-an-interval rule as an INLINE
    // unnamed CHECK, which is exactly why nobody can find it. Named ones show
    // up in the error, in \\d, and in a grep.
    for (const c of [
      "offer_prices_recurring_needs_interval",
      "offer_prices_one_time_has_no_trial",
      "offer_prices_compare_at_above_price",
    ]) {
      expect(SQL, c).toMatch(new RegExp(`constraint\\s+${c}`));
    }
  });
});

describe("the mirror on offers", () => {
  /**
   * offers.price_cents and its siblings are now a cache of the headline price,
   * written by one trigger. A price field added to offer_prices and NOT added
   * to that trigger leaves the mirror quietly stale — and a stale mirror does
   * not fail anywhere. It quotes the wrong price to a live subscriber in a
   * trial-ending email and looks entirely plausible.
   */
  const MIRRORED = [
    "billing_type",
    "interval",
    "interval_count",
    "trial_days",
    "price_cents",
    "compare_at_cents",
  ];

  it("copies every price column, not most of them", () => {
    const body = SQL.slice(SQL.indexOf("update offers"), SQL.indexOf("where id = o_id"));
    for (const col of MIRRORED) expect(body, col).toContain(col);
  });

  it("moves billing_type and interval together", () => {
    // offers' own inline CHECK is "recurring implies an interval". Copying one
    // without the other is a write the database rejects, from a trigger, with
    // an error naming a table the caller never touched.
    const body = SQL.slice(SQL.indexOf("update offers"), SQL.indexOf("where id = o_id"));
    expect(body).toContain("billing_type");
    expect(body).toContain("interval");
  });

  it("leaves the last known price standing when nothing is showing", () => {
    // offers.price_cents is NOT NULL, so the alternative is failing somebody's
    // save with a constraint error from a table they did not write to.
    expect(SQL).toMatch(/if not found then\s+return null;/);
  });

  it("takes the first price that is showing, by a total order", () => {
    // sort_order alone is not total. If the render order and the server's
    // rebuild of it ever differ by one, a buyer is charged the option beside
    // the one they ticked, and nothing anywhere reports an error.
    expect(SQL).toMatch(/order by sort_order,\s*created_at/);
    expect(SQL).toContain("archived = false");
  });
});

describe("who may be deleted", () => {
  it("cannot delete a price somebody is on", () => {
    // The admin refusing is the polite version. This is the one that holds
    // when a script, a console or a screen nobody has written yet forgets.
    const links = SQL.slice(SQL.indexOf("alter table ownership"));
    expect((links.match(/on delete restrict/g) ?? []).length).toBe(2);
  });

  it("records which price every existing buyer is on", () => {
    // Without the backfill the subscriber count under-reports, and an
    // under-count is what lets somebody remove a price people are paying for.
    expect(SQL).toContain("update ownership o set offer_price_id");
    expect(SQL).toContain("update order_items i set offer_price_id");
  });
});

describe("the migration is the latest one", () => {
  it("has a number nothing else has taken", () => {
    const numbers = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.slice(0, 4));
    expect(numbers.filter((n) => n === "0048")).toHaveLength(1);
  });
});

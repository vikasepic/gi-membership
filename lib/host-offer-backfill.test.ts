import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * The backfill that attributes offer purchases made before 0077 existed.
 *
 * Reported 10 Sep 2026: the traffic screen showed Book Writer with 1 sale
 * against two real charges in Stripe. `orders.host_offer_id` is written
 * forward only, and the missing sale was bought the day before the column
 * existed. Every other Stripe charge in the window already had an order — no
 * money went unrecorded, only unattributed.
 *
 * The rule has to stay conservative: an offer sold on its own page and an
 * offer accepted as an upsell are both written with kind 'oto', so an order
 * carrying two of them cannot say which was the purchase. Guessing would put
 * a made-up number on the screen somebody makes spending decisions from.
 */
const sql = readFileSync("supabase/migrations/0078_backfill_host_offer.sql", "utf8");

describe("the host-offer backfill", () => {
  it("only fills nulls, so a re-run changes nothing", () => {
    expect(sql).toContain("o.host_offer_id is null");
  });

  it("never claims an order that has a product line", () => {
    // A product order's host is the product; its host_offer_id must stay null
    // or paidByOffer would count it as an offer sale as well.
    expect(sql).toMatch(/not exists\s*\([\s\S]*?p\.kind = 'product'/);
  });

  it("refuses an order with two 'oto' lines, where the host is a guess", () => {
    expect(sql).toMatch(/count\(\*\)[\s\S]*?x\.kind = 'oto'[\s\S]*?\)\s*=\s*1/);
  });

  it("still attributes an offer bought with a bump beside it", () => {
    // A bump is kind 'bump' and is never the host, so it does not make the
    // order ambiguous — the rule counts 'oto' lines, not all offer lines.
    expect(sql).toContain("i.kind = 'oto'");
    expect(sql).not.toMatch(/count\(\*\)[\s\S]{0,120}offer_id is not null[\s\S]{0,40}\)\s*=\s*1/);
  });

  it("writes the offer from the line it picked, not from anywhere else", () => {
    expect(sql).toContain("set host_offer_id = pick.offer_id");
  });
});

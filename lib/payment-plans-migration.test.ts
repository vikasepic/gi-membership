import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const SQL = readFileSync("supabase/migrations/0085_payment_plans.sql", "utf8");

describe("the payment plans migration", () => {
  it("has a number nothing else has taken", () => {
    const numbers = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.slice(0, 4));
    expect(numbers.filter((n) => n === "0085")).toHaveLength(1);
  });

  it("adds installments to both price tables with the same rule", () => {
    for (const table of ["offer_prices", "product_prices"]) {
      expect(SQL).toContain(`alter table ${table}\n  add column if not exists installments integer`);
      expect(SQL).toContain(`constraint ${table}_installments_plan`);
    }
    // 2 to 24, recurring only. CHECK constraints are invisible to tsc and
    // vitest, so the rule is pinned here where a reader will see it.
    expect((SQL.match(/installments between 2 and 24 and billing_type = 'recurring'/g) ?? []).length).toBe(2);
  });
});

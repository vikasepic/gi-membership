import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const sql = readdirSync("supabase/migrations")
  .sort()
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
  .join("\n");

/**
 * The storefront is a page, and for a while the database did not agree.
 *
 * `owner_type` was written when a page could only belong to a product or an
 * offer, and carried a CHECK saying so. The home page editor shipped with
 * "store" as a third owner in TypeScript and no migration behind it, so every
 * save from /admin/home failed on the constraint — an editor that looked
 * finished and could not write a row. Nothing in the type system could catch
 * that, because the constraint is not in the type system.
 */
describe("the database agrees about what an owner is", () => {
  it("allows a store page in page_sections", () => {
    const last = sql.lastIndexOf("page_sections_owner_type_check");
    expect(last, "no check constraint for page_sections.owner_type").toBeGreaterThan(-1);
    // The final word on the constraint has to include 'store'.
    expect(sql.slice(last, last + 400)).toContain("'store'");
  });

  it("allows a store page in page_settings too", () => {
    const last = sql.lastIndexOf("page_settings_owner_type_check");
    expect(last).toBeGreaterThan(-1);
    expect(sql.slice(last, last + 400)).toContain("'store'");
  });

  it("keeps a check rather than dropping it", () => {
    // Widening is right; removing the constraint would let a typo become an
    // owner_type nothing reads, and rows nobody finds again.
    expect(sql).toContain("check (owner_type in ('product', 'offer', 'store'))");
  });

  it("covers every owner the code can produce", () => {
    // If OwnerType grows again, this fails until the migration does too.
    const owners = readFileSync("lib/pages.ts", "utf8")
      .match(/export type OwnerType =([^;]+);/)![1]
      .match(/"([a-z]+)"/g)!
      .map((s) => s.replace(/"/g, ""));
    const last = sql.slice(sql.lastIndexOf("page_sections_owner_type_check"));
    for (const o of owners) expect(last, `owner_type '${o}' is not allowed by the constraint`).toContain(`'${o}'`);
  });
});

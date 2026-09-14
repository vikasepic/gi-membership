import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const SQL = readFileSync("supabase/migrations/0084_page_drafts.sql", "utf8");

describe("the page drafts migration", () => {
  it("has a number nothing else has taken", () => {
    const numbers = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.slice(0, 4));
    expect(numbers.filter((n) => n === "0084")).toHaveLength(1);
  });

  it("keeps every existing row live", () => {
    // A default of now() is what makes rows inserted by the OLD code, during
    // the window between migration and deploy, read as published.
    expect(SQL).toMatch(/published_at\s+timestamptz\s+default now\(\)/);
    expect(SQL).toContain("update page_sections set published_at = coalesce(updated_at, now())");
  });

  it("publishes in one function the service role alone may call", () => {
    expect(SQL).toContain(
      "create or replace function publish_page_drafts(p_owner_type text, p_owner_id uuid, p_section_key text default null)",
    );
    expect(SQL).toContain("revoke all on function publish_page_drafts(text, uuid, text) from public");
    expect(SQL).toContain("grant execute on function publish_page_drafts(text, uuid, text) to service_role");
  });
});

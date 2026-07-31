import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { OTO_TEMPLATES } from "@/lib/oto-template";

// The layout list lives in five places: this constant, the component registry,
// the admin dropdown, the database check constraint, and the save validator.
// `sales` was added to four of them and missed in the validator, so choosing it
// failed with a bare "Invalid input" and the offer could not be saved at all.
//
// These read the real files rather than mocking, because the failure mode is
// precisely that one file disagrees with the others.

const read = (p: string) => readFileSync(p, "utf8");

describe("upsell layout wiring stays in sync", () => {
  it("offers every template in the admin dropdown", () => {
    const form = read("components/admin/offer-form.tsx");
    for (const t of OTO_TEMPLATES) {
      expect(form, `dropdown is missing "${t}"`).toContain(`value="${t}"`);
    }
    expect(form).toContain('value="custom"');
  });

  it("renders a component for every template", () => {
    const registry = read("components/oto/registry.tsx");
    for (const t of OTO_TEMPLATES) {
      expect(registry, `registry has no component for "${t}"`).toMatch(
        new RegExp(`\\b${t}:\\s*\\w+`),
      );
    }
  });

  it("allows every template through the database constraint", () => {
    // The latest migration that redefines the constraint wins.
    const sql = read("supabase/migrations/0019_oto_sections.sql");
    for (const t of OTO_TEMPLATES) {
      expect(sql, `check constraint rejects "${t}"`).toContain(`'${t}'`);
    }
  });

  it("derives the save validator from the constant instead of repeating it", () => {
    const actions = read("app/admin/offers/actions.ts");
    // A hand-written list here is the exact bug this file exists to prevent.
    expect(actions).toContain("OTO_TEMPLATES");
    expect(actions).not.toMatch(/z\.enum\(\s*\[\s*"short"/);
  });
});

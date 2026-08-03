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
    // A template is wired if the registry maps it, or if it is named as
    // resolved earlier — `sections` loads its content from the database, which
    // a component map cannot do. Both count; neither being true does not.
    const registry = read("components/oto/registry.tsx");
    for (const t of OTO_TEMPLATES) {
      expect(registry, `nothing renders "${t}"`).toMatch(new RegExp(`\\b${t}:\\s*\\S+`));
    }
  });

  it("routes the templates that are resolved outside the registry", () => {
    // Naming one in RESOLVED_ELSEWHERE is a promise that the pages handle it.
    // Without this, the promise is a comment and the page renders nothing.
    const oto = read("app/(store)/checkout/oto/page.tsx");
    const preview = read("app/oto-preview/[id]/page.tsx");
    for (const surface of [oto, preview]) {
      expect(surface).toContain('=== "sections"');
      expect(surface).toContain("SectionsOto");
    }
  });

  it("allows every template through the database constraint", () => {
    // The latest migration that redefines the constraint wins.
    const sql = read("supabase/migrations/0025_oto_template_sections.sql");
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

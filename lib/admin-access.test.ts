import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Two admin lists, and the difference between them is a safety property:
//
//   ADMIN_EMAILS   break-glass, in the environment, not editable from the UI
//   users.is_admin manageable through Admin -> Members
//
// If the UI could remove an ADMIN_EMAILS account, a mistake on that page could
// lock everyone out of their own store. These pin that it cannot.

const guard = readFileSync("lib/admin-guard.ts", "utf8");
const mw = readFileSync("proxy.ts", "utf8");
const actions = readFileSync("app/admin/members/actions.ts", "utf8");
const page = readFileSync("app/admin/members/page.tsx", "utf8");
const row = readFileSync("components/admin/member-row.tsx", "utf8");

describe("admin access", () => {
  it("checks the env list first, then the database flag", () => {
    expect(guard).toMatch(/isAdminEmail\(user\.email\)[\s\S]{0,60}return user/);
    expect(guard).toContain("isAdminInDb");
  });

  it("gates the middleware on both lists", () => {
    expect(mw).toContain("ADMIN_EMAILS");
    expect(mw).toContain("is_admin");
  });

  it("denies rather than allows when the admin lookup fails", () => {
    // A gate that opens when the database is unreachable is not a gate.
    expect(mw).toMatch(/catch[\s\S]{0,200}allowed = false/);
  });

  it("refuses to toggle an ADMIN_EMAILS account", () => {
    expect(actions).toMatch(/if \(isAdminEmail\(email\)\)[\s\S]{0,120}return;/);
  });

  it("shows env admins as permanent rather than toggleable", () => {
    // The page decides who is one; the row refuses to offer a toggle for them.
    // A toggle there would claim to remove access it cannot remove — the guard
    // reads the environment first and would let them straight back in.
    expect(page).toContain("isOwner={isAdminEmail(m.email)}");
    expect(row).toMatch(/isOwner \?[\s\S]{0,400}Admin through the environment/);
    expect(row).toMatch(/isOwner \?[\s\S]{0,600}toggleAdminAction/);
  });

  it("labels an environment admin distinctly in the list", () => {
    expect(row).toContain('isOwner ? "owner" : "admin"');
  });

  it("re-checks admin on every mutating action", () => {
    // The middleware is convenience; a server action is reachable directly.
    const mutating = actions.match(/export async function \w+Action/g) ?? [];
    const guards = actions.match(/await requireAdmin\(\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(mutating.length);
  });
});

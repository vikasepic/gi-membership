import { describe, it, expect } from "vitest";
import { listTemplates } from "@/lib/templates";

/**
 * The library is keyed by id, so two designs sharing one is not a tidiness
 * problem. React keeps the first tile and drops the second, so one design
 * draws the other's preview and Add inserts the wrong blocks — which is
 * exactly what two templates both called "faq-accordion" were doing.
 */
describe("every design is its own row", () => {
  it("has no two templates sharing an id", () => {
    const seen = new Map<string, string[]>();
    for (const t of listTemplates()) seen.set(t.id, [...(seen.get(t.id) ?? []), t.name]);
    expect([...seen].filter(([, names]) => names.length > 1)).toEqual([]);
  });

  it("files each one under a heading the sidebar can show", () => {
    for (const t of listTemplates()) {
      expect(t.group.trim(), t.id).toBe(t.group);
      expect(t.group.length, t.id).toBeGreaterThan(0);
    }
  });
});

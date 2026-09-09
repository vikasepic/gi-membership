import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  BUILTIN_APPS,
  builtinApp,
  builtinAppRoute,
  isBuiltinAppKey,
} from "@/lib/builtin-apps/registry";

/**
 * The registry and the migration name the same apps.
 *
 * A row in `apps` says an internal app can be sold; the registry says this
 * build can open it. The migration that inserts the rows is the only other
 * place the keys are written down, so the two are checked against each other
 * here rather than discovered by a buyer whose library card says "Not
 * available yet".
 */
describe("built-in app registry", () => {
  it("routes every app at /apps/<key>", () => {
    for (const app of Object.values(BUILTIN_APPS)) {
      expect(app.route).toBe(`/apps/${app.key}`);
      expect(app.key).toMatch(/^[a-z0-9-]+$/);
      expect(app.name.trim()).not.toBe("");
    }
  });

  it("answers by key and refuses anything else", () => {
    expect(isBuiltinAppKey("micro-product-builder")).toBe(true);
    expect(isBuiltinAppKey("content-engine")).toBe(false);
    expect(builtinApp("hook-generator")?.name).toBe("Viral Hook Generator");
    expect(builtinApp("funnel")).toBeNull();
    expect(builtinAppRoute("nope")).toBeNull();
    // A prototype key is not an app.
    expect(isBuiltinAppKey("constructor")).toBe(false);
  });

  it("matches the keys the migration registers", () => {
    const sql = readFileSync("supabase/migrations/0074_app_kind.sql", "utf8");
    for (const key of Object.keys(BUILTIN_APPS)) {
      expect(sql, `${key} is in the registry but not in 0074`).toContain(`('${key}',`);
    }
  });
});

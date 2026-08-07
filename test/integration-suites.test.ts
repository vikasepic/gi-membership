import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// CI has no database, so every integration suite has to stand down on its own.
// One that does not fails the whole run — and it fails at the fixture, with a
// ZodError about a missing env var, which reads like a broken commit rather
// than a missing guard. That cost four red builds before anyone read the log.

const ROOTS = ["lib", "app", "components"];

function suites(dir: string, found: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) suites(path, found);
    else if (e.name.endsWith(".integration.test.ts")) found.push(path);
  }
  return found;
}

const files = ROOTS.flatMap((r) => suites(r));

describe("every integration suite skips itself without a database", () => {
  it("finds the suites at all", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)("%s guards on an env var", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/const canRun =/);
    expect(src).toMatch(/describe\.skipIf\(!canRun\)/);
  });

  it.each(files)("%s guards on a secret, not on a public value", (file) => {
    // The public URL has a placeholder in vitest.setup.ts, so guarding on it
    // means "a database exists" is true everywhere and every suite runs in CI.
    // A service-role key and a Stripe secret are the things you cannot have
    // without the real thing behind them.
    const src = readFileSync(file, "utf8");
    const guards = src.match(/const canRun[A-Za-z]* =[\s\S]*?;/g) ?? [];
    for (const guard of guards) {
      expect(guard, `${file}: guard on a secret`).toMatch(
        /SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|AC_API_KEY/,
      );
      expect(guard, `${file}: NEXT_PUBLIC_ values are defaulted for tests`).not.toContain(
        "NEXT_PUBLIC_",
      );
    }
  });

  it.each(files)("%s does not open a bare describe", (file) => {
    // A single unguarded describe runs its body — and its fixtures — anyway.
    const bare = readFileSync(file, "utf8").match(/^describe\(/gm);
    expect(bare, `${file} has an unguarded describe()`).toBeNull();
  });
});

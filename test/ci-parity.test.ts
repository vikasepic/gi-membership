import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * The test run must not depend on what is on one developer's disk.
 *
 * Every red build in this repo's history has been the same shape: a suite that
 * is green on the machine that wrote it and red for everyone else, because
 * vitest.setup.ts loaded .env.local and stopped there. Anything reading the
 * public environment then threw a ZodError in CI, where that file does not
 * exist — and the log said "invalid_type: expected string" about a variable
 * nobody had touched, which reads like a broken commit rather than a missing
 * default.
 */

const setup = readFileSync("vitest.setup.ts", "utf8");
const workflow = readdirSync(".github/workflows")
  .map((f) => readFileSync(`.github/workflows/${f}`, "utf8"))
  .join("\n");

describe("the test environment stands on its own", () => {
  it.each([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  ])("%s has a value even with no .env.local", (key) => {
    expect(setup).toContain(key);
    expect(process.env[key], key).toBeTruthy();
  });

  it("lets a real .env.local win", () => {
    // The integration suites talk to the local stack; a default that overrode
    // it would point them at nothing.
    expect(setup).toContain("if (!process.env[key]) process.env[key] = value");
  });

  it("defaults nothing secret", () => {
    // A placeholder secret is worse than a missing one: it makes a guard say
    // yes and a suite run against nothing. And a fake key that reached a real
    // service would be worse still.
    for (const secret of ["STRIPE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "AC_API_KEY"]) {
      expect(setup, secret).not.toContain(`${secret}:`);
    }
  });
});

describe("CI runs what a person runs", () => {
  it("typechecks, lints, tests and builds", () => {
    // A typecheck and a green suite have both passed while the build was
    // broken. The build is the only step that reads the environment for real.
    for (const step of ["tsc --noEmit", "next lint", "npm test", "npm run build"]) {
      expect(workflow, step).toContain(step);
    }
  });

  it("cancels a run nobody is waiting for", () => {
    // Push twice in a minute and the first run answers about a commit nobody is
    // on — and its failure email looks exactly like a real one.
    expect(workflow).toContain("cancel-in-progress: true");
  });

  it("gives the build an environment, since it needs one", () => {
    expect(workflow).toContain("NEXT_PUBLIC_SUPABASE_URL:");
  });
});

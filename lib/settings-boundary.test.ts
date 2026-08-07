import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * `lib/settings.ts` holds a service-role client and is marked `server-only`, so
 * importing it from a component that runs in the browser fails the production
 * build — and only the production build, which means a green typecheck and a
 * green suite both say nothing about it.
 *
 * That has now happened twice in this codebase: once with `lib/media` reaching
 * a catalogue thumbnail, and once here with the settings form. The shapes live
 * in `lib/settings-schema.ts` precisely so the browser has somewhere safe to
 * read them from.
 */
const CLIENT_FILES = [
  "components/admin/settings-screen.tsx",
  "components/app-shell.tsx",
];

describe("the settings client boundary", () => {
  it.each(CLIENT_FILES)("%s reads shapes, not the database layer", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toContain('from "@/lib/settings"');
  });

  it("keeps the database client out of the schema module", () => {
    // If this ever gains a Supabase import, every client importing it starts
    // pulling the service-role key's module graph into the browser bundle.
    const schema = readFileSync("lib/settings-schema.ts", "utf8");
    expect(schema).not.toContain("supabase");
    expect(schema).not.toContain("server-only");
  });

  it("keeps the database layer server-only", () => {
    expect(readFileSync("lib/settings.ts", "utf8")).toContain('import "server-only"');
  });
});

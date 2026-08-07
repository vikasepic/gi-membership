import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The name we send connected apps is `fullName`, and the docs have to say so.
 *
 * It shipped documented nowhere, which cost the Funnel App developer a message
 * asking which of `name` / `fullName` / `full_name` to accept — a question the
 * brief should have answered before they ever wrote the endpoint. Renaming the
 * key in code without renaming it in the docs would put the next integrator in
 * the same position, except they would not ask; they would read the guide, key
 * off the wrong field, and every buyer would arrive nameless.
 */

const apps = readFileSync("lib/apps.ts", "utf8");
const guide = readFileSync("docs/app-integration-guide.md", "utf8");
const brief = readFileSync("docs/funnel-app-brief.md", "utf8");

describe("the name field we send apps", () => {
  it("is called fullName on the provision call", () => {
    expect(apps).toContain("fullName: args.fullName ?? null");
  });

  it("is called fullName inside the signed handoff token", () => {
    // Same key on both channels. An app that reads one and not the other is a
    // buyer who is named when they buy and nameless when they arrive.
    expect(apps).toContain("fullName: user.fullName ?? null");
  });

  it("is the key the integration guide documents", () => {
    expect(guide).toContain('"fullName"');
    expect(guide).toContain("| `fullName` |");
  });

  it("is the key the Funnel App brief documents", () => {
    expect(brief).toContain("fullName");
  });

  it("is documented as nullable in both", () => {
    // Never keyed on, never used to overwrite a name the app already holds.
    for (const doc of [guide, brief]) {
      expect(/fullName[\s\S]{0,400}null/i.test(doc)).toBe(true);
    }
  });
});

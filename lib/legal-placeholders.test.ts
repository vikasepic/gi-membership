import { describe, it, expect } from "vitest";
import { legalPlaceholdersFrom } from "@/lib/legal";
import { SETTINGS_SCHEMA, type Settings } from "@/lib/settings-schema";

const make = (over: Record<string, unknown>): Settings => ({ ...SETTINGS_SCHEMA.parse(over), name: "S" });

/**
 * Asked 18 Sep 2026: "if the errors are already resolved, why do we still
 * see them?" The Legal tab nagged about an address on the built-in terms
 * page while the footer and both checkouts sent every buyer to the terms on
 * greaterinside.com. A page nobody is sent to has nothing to warn about.
 */
describe("the legal nag", () => {
  it("is silent when the terms live on another site", () => {
    expect(legalPlaceholdersFrom(make({}))).toEqual([]);
  });
  it("names what is missing when the built-in terms page is the one buyers get", () => {
    expect(legalPlaceholdersFrom(make({ termsUrl: "" }))).toEqual(["registered address", "governing law"]);
  });
});

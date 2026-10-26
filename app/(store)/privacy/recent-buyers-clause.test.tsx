import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The recent buyers popup shows real first names and flags on public pages;
 * the privacy policy has to say so, in the wording the owner approved on
 * 26 Oct 2026, with the address a buyer writes to for removal.
 */

vi.mock("server-only", () => ({}));
// The defaults, not the database: a policy test should not wait on a store read.
vi.mock("@/lib/legal", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/legal")>();
  const { SETTINGS_DEFAULTS } = await import("@/lib/settings-schema");
  return {
    ...real,
    getLegal: async () => ({ ...real.legalFrom({ ...SETTINGS_DEFAULTS, name: "Greater Inside" }), privacyEmail: "privacy@example.test" }),
  };
});

const { default: PrivacyPage } = await import("@/app/(store)/privacy/page");

describe("the privacy policy", () => {
  it("names the recent buyers popup and how to be removed from it", async () => {
    const text = renderToStaticMarkup(await PrivacyPage()).replace(/<[^>]+>/g, "").replace(/&#x27;|&#39;/g, "'");
    expect(text).toContain(
      "On our sales pages we show recent purchases from the last two weeks: the buyer's first name, their country's flag and what they bought. We never show surnames, email addresses, cities or amounts. Ask us at privacy@example.test and we will remove you.",
    );
  });
});

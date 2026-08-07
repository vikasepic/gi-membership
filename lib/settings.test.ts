import { describe, it, expect } from "vitest";
import {
  SETTINGS_SCHEMA,
  SETTINGS_DEFAULTS,
  SETTINGS_GROUPS,
  GROUP_FIELDS,
} from "@/lib/settings-schema";
import { LEGAL_DEFAULTS } from "@/lib/legal-defaults";

/**
 * The parts of settings that can be reasoned about without a database. The
 * merge itself is covered by the integration suite; everything here is the
 * shape that decides whether a merge is even safe.
 */

describe("settings defaults", () => {
  it("renders the store exactly as before when nothing is saved", () => {
    // The whole point of the fallback: this table can be empty and the shop is
    // unchanged. If a default drifts from the code constant it replaced, a
    // policy page silently starts saying something new.
    expect(SETTINGS_DEFAULTS.legalEntity).toBe(LEGAL_DEFAULTS.legalEntity);
    expect(SETTINGS_DEFAULTS.contactEmail).toBe(LEGAL_DEFAULTS.contactEmail);
    expect(SETTINGS_DEFAULTS.privacyEmail).toBe(LEGAL_DEFAULTS.privacyEmail);
    expect(SETTINGS_DEFAULTS.refundWindowDays).toBe(LEGAL_DEFAULTS.refundWindowDays);
    expect(SETTINGS_DEFAULTS.policiesUpdated).toBe(LEGAL_DEFAULTS.lastUpdated);
  });

  it("keeps the two legal blanks blank", () => {
    // These must stay empty until someone decides them, because the policy
    // pages warn readers while they are — a plausible-looking default here
    // would silence that warning without anyone choosing anything.
    expect(SETTINGS_DEFAULTS.address).toBe("");
    expect(SETTINGS_DEFAULTS.governingLaw).toBe("");
  });
});

describe("what the fields accept", () => {
  it("refuses a refund window below the statutory minimum", () => {
    // Not a style rule: under 14 days is not generally enforceable against an
    // EU/UK consumer, so the field will not let the store state it.
    expect(SETTINGS_SCHEMA.shape.refundWindowDays.safeParse("7").success).toBe(false);
    expect(SETTINGS_SCHEMA.shape.refundWindowDays.safeParse("30").success).toBe(true);
  });

  it("takes a number from a form, which sends strings", () => {
    const parsed = SETTINGS_SCHEMA.shape.refundWindowDays.safeParse("30");
    expect(parsed.success && parsed.data).toBe(30);
  });

  it("refuses a colour that is not a hex value", () => {
    // This string is written into a stylesheet. "red; }" ends the rule.
    expect(SETTINGS_SCHEMA.shape.primaryColor.safeParse("red").success).toBe(false);
    expect(SETTINGS_SCHEMA.shape.primaryColor.safeParse("#b4472b").success).toBe(true);
    expect(SETTINGS_SCHEMA.shape.primaryColor.safeParse("#fff").success).toBe(true);
  });

  it("refuses a social link that is not a URL, but allows none at all", () => {
    expect(SETTINGS_SCHEMA.shape.socialInstagram.safeParse("instagram.com/x").success).toBe(false);
    expect(SETTINGS_SCHEMA.shape.socialInstagram.safeParse("").success).toBe(true);
    expect(SETTINGS_SCHEMA.shape.socialInstagram.safeParse("https://instagram.com/x").success).toBe(true);
  });

  it("normalises a currency code", () => {
    const parsed = SETTINGS_SCHEMA.shape.currency.safeParse("USD");
    expect(parsed.success && parsed.data).toBe("usd");
    expect(SETTINGS_SCHEMA.shape.currency.safeParse("dollars").success).toBe(false);
  });
});

describe("the groups", () => {
  it("puts Legal first", () => {
    // Ordered by what leaving it alone costs. Two blank legal fields put a
    // warning in front of buyers on a live page; nothing else here does.
    expect(SETTINGS_GROUPS[0].key).toBe("legal");
  });

  it("gives every group a field list", () => {
    for (const g of SETTINGS_GROUPS) {
      expect(GROUP_FIELDS[g.key]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("claims every field exactly once", () => {
    // A field in two groups is written by both, so saving one group would
    // quietly overwrite what the other just wrote. A field in none can be
    // edited nowhere.
    const claimed = Object.values(GROUP_FIELDS).flat();
    expect(new Set(claimed).size).toBe(claimed.length);

    const inSchema = Object.keys(SETTINGS_SCHEMA.shape);
    const missing = inSchema.filter((f) => !claimed.includes(f as never));
    expect(missing).toEqual([]);
  });

  it("only claims fields that exist", () => {
    // `name` is the one exception: a real column on stores, not a settings key.
    const known = new Set([...Object.keys(SETTINGS_SCHEMA.shape), "name"]);
    for (const [group, fields] of Object.entries(GROUP_FIELDS)) {
      for (const f of fields) expect([group, f, known.has(f)]).toEqual([group, f, true]);
    }
  });
});

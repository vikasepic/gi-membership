import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  APP_CHANNELS,
  APP_CHANNEL_VALUES,
  channelsLabel,
  normalizeChannels,
} from "@/lib/app-channels";

/**
 * What an offer grants inside a connected app.
 *
 * Four places have to agree about these values and only three of them are in
 * this repo: the tickbox list, the save action, and the CHECK in 0058. The
 * fourth is the app itself, which is why the tests below care most about the
 * ways a wrong value could travel — a value the database will refuse, or a
 * ticked box that never arrives.
 */

describe("the channels an offer can grant", () => {
  it("keeps only values the database will accept", () => {
    // The CHECK refuses anything else with a database error rather than a
    // message an admin can act on, so nothing unknown may get that far.
    expect(normalizeChannels(["instagram", "tiktok", "", "nonsense"])).toEqual(["instagram"]);
    expect(normalizeChannels("linkedin")).toEqual(["linkedin"]);
    expect(normalizeChannels(undefined)).toEqual([]);
    expect(normalizeChannels(null)).toEqual([]);
  });

  it("keeps both when both are ticked", () => {
    // The case that was silently broken: a repeated form field read through
    // Object.fromEntries keeps only the last one, so an offer sold as "both"
    // would have granted one.
    expect(normalizeChannels(["instagram", "linkedin"])).toEqual(["instagram", "linkedin"]);
    // Order follows the list, not the form, so two offers ticked in different
    // orders store the same thing and compare equal.
    expect(normalizeChannels(["linkedin", "instagram"])).toEqual(["instagram", "linkedin"]);
  });

  it("does not let a duplicate through as two grants", () => {
    expect(normalizeChannels(["instagram", "instagram"])).toEqual(["instagram"]);
  });

  it("reads back as something a person would say", () => {
    expect(channelsLabel(["instagram"])).toBe("Instagram");
    expect(channelsLabel(["instagram", "linkedin"])).toBe("Instagram and LinkedIn");
    expect(channelsLabel([])).toBe("the app's own default");
  });
});

describe("the constraint and the list", () => {
  const sql = readFileSync("supabase/migrations/0058_offer_grant_channels.sql", "utf8");

  it("names its CHECK", () => {
    // Three of the CHECKs on `offers` are inline and unnamed, which is why
    // they are invisible in a diff and why a feature has twice shipped that
    // the database then refused.
    expect(sql).toContain("constraint offers_grant_channels_known");
  });

  it("allows exactly the channels the editor offers", () => {
    // The two lists drifting apart is the failure this file exists for: a
    // tickbox that saves nothing, or a channel the app is never told about.
    const inCheck = [...sql.matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1])
      .filter((v) => APP_CHANNEL_VALUES.includes(v) || ["tiktok", "facebook", "x", "youtube"].includes(v));
    for (const c of APP_CHANNEL_VALUES) {
      expect(inCheck, `${c} is offered in the editor`).toContain(c);
    }
    // And nothing the editor cannot produce.
    expect(new Set(inCheck)).toEqual(new Set(APP_CHANNEL_VALUES));
  });

  it("says what everything already sold grants", () => {
    // Every offer granting an app today grants Instagram. Stated once in the
    // migration rather than inferred at read time forever after.
    expect(sql).toMatch(/update offers[\s\S]*grant_channels = array\['instagram'\]/i);
    expect(sql).toMatch(/where grant_app_id is not null/i);
  });
});

describe("what reaches the app", () => {
  const apps = readFileSync("lib/apps.ts", "utf8");

  it("sends channels beside the entitlement key, never instead of it", () => {
    // The whole reason this is safe to ship before the app changes: an app
    // that has not learned to read `channels` keeps working on the key alone.
    expect(apps).toContain("entitlementKey: args.entitlementKey");
    expect(apps).toContain("channels: args.channels");
  });

  it("leaves the field out entirely when there is nothing to say", () => {
    // An offer granting a course would otherwise post an empty array, and the
    // app would have to decide what an empty array means.
    expect(apps).toMatch(/args\.channels && args\.channels\.length > 0/);
  });

  it("is passed on by every path that grants access", () => {
    for (const [file, why] of [
      ["lib/checkout.ts", "a purchase"],
      ["lib/members.ts", "an admin granting or revoking by hand"],
      ["lib/app-sync.ts", "the backfill that replays what is already owned"],
      ["lib/retry.ts", "the sweep that retries a push the app missed"],
    ] as const) {
      expect(readFileSync(file, "utf8"), `${file} — ${why}`).toMatch(/channels[:,]/);
    }
  });
});

describe("the editor", () => {
  it("reads a repeated checkbox with getAll, not fromEntries", () => {
    // fromEntries keeps the LAST value of a repeated key. Ticking both
    // channels would have saved one, and nothing would have said so.
    const action = readFileSync("app/admin/offers/actions.ts", "utf8");
    expect(action).toContain('formData.getAll("grantChannels")');
  });

  it("offers every channel the code knows about", () => {
    const form = readFileSync("components/admin/offer-form.tsx", "utf8");
    expect(form).toContain("APP_CHANNELS.map");
    expect(APP_CHANNELS.length).toBeGreaterThan(1);
  });
});

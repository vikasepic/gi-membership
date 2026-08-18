import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { channelLabel, normalizeChannels } from "@/lib/app-channels";

/**
 * Whose idea a channel is.
 *
 * 0058 gave an OFFER a set of channels and put the tickboxes on every offer
 * that grants an app — because the only connected app at the time was Content
 * Engine, where a channel means something. The Funnel App has no such
 * division. So its offer showed an Instagram tickbox, and 0058's backfill
 * ("every offer granting an app grants Instagram", true of everything that
 * existed when it was written) ticked it and sent `channels: ["instagram"]` to
 * an app that has never heard of one.
 *
 * The app declares what it understands. Nothing else may decide it has any.
 */

const migration = readFileSync("supabase/migrations/0061_app_channels.sql", "utf8");
const form = readFileSync("components/admin/offer-form.tsx", "utf8");
const actions = readFileSync("app/admin/offers/actions.ts", "utf8");
const apps = readFileSync("lib/apps.ts", "utf8");

describe("the app says what it has", () => {
  it("has somewhere to say it", () => {
    expect(migration).toContain("alter table apps");
    expect(migration).toContain("add column if not exists channels text[] not null default '{}'");
  });

  it("is constrained by a NAMED check", () => {
    // An unnamed CHECK is invisible in a diff, which is how this repo has
    // twice shipped a feature the database then refused.
    expect(migration).toContain("apps_channels_known");
    expect(migration).toContain("check (channels <@ array['instagram', 'linkedin']::text[])");
  });

  it("gives them to the one app that has them, by key not by name", () => {
    // The name is editable in the admin; the key is what the bridge is wired to.
    expect(migration).toMatch(/update apps[\s\S]{0,200}where key in \('content-engine'/);
  });

  it("takes back what the earlier backfill over-gave", () => {
    // Only where the app now says it has none. An offer whose app does have
    // them keeps exactly what it was sold as.
    expect(migration).toContain("a.channels = '{}'");
    expect(migration).toMatch(/update offers[\s\S]{0,200}set grant_channels = '\{\}'/);
  });
});

describe("the offer form", () => {
  it("asks the app, never a global list", () => {
    expect(form).toContain("apps.find((a) => a.id === grantAppId)");
    expect(form).toContain("grantedApp?.channels ?? []");
    // The constant that used to drive it is not the thing being rendered.
    expect(form).not.toContain("APP_CHANNELS.map");
  });

  it("shows nothing at all for an app with none", () => {
    expect(form).toContain("{appChannels.length > 0 && (");
  });

  it("follows the app select rather than the page load", () => {
    // Picking a different app with the form open has to change the tickboxes,
    // or the admin ticks Instagram for the Funnel App again.
    expect(form).toContain("onChange={(e) => setGrantAppId(e.target.value)}");
  });
});

describe("saving", () => {
  it("drops a channel the app never declared", () => {
    expect(actions).toContain("const declared = v.grantAppId ? await appChannels(v.grantAppId) : []");
    expect(actions).toContain("v.grantChannels.filter((c) => declared.includes(c))");
  });

  it("reads the declaration from the app row", () => {
    expect(apps).toContain("export async function appChannels");
    expect(apps).toContain('.select("channels")');
  });

  it("still refuses a value the database would refuse", () => {
    // The app's list narrows; it does not replace the vocabulary check.
    expect(normalizeChannels(["instagram", "tiktok"])).toEqual(["instagram"]);
  });
});

describe("naming one", () => {
  it("uses the brand's own capitalisation", () => {
    expect(channelLabel("linkedin")).toBe("LinkedIn");
  });

  it("prints an unknown value rather than swallowing it", () => {
    expect(channelLabel("threads")).toBe("threads");
  });
});

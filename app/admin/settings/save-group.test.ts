import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  GROUP_FIELDS,
  SETTINGS_DEFAULTS,
  SETTINGS_SCHEMA,
  type Settings,
} from "@/lib/settings-schema";
import { SITE_SHELL_DEFAULTS } from "@/lib/site-shell";
import { SITE_TYPOGRAPHY_DEFAULTS } from "@/lib/site-typography";

/**
 * What one save actually writes.
 *
 * This is the highest-consequence code on the settings screen and it had no
 * test at all: both of its data-loss guards — the JSON branch and the conflict
 * comparison — could be deleted and the whole suite would stay green while the
 * next Typography save blanked the store's type. So this drives the real action
 * with a real FormData and asserts on the patch it hands `saveSettings`.
 */

let stored: Settings = { ...SETTINGS_DEFAULTS, name: "Greater Inside" };
const saved = vi.fn(async (_p: Partial<Settings>) => {});
const families = vi.fn(async () => ["Lora"]);

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: async () => {} }));
vi.mock("@/lib/fonts", () => ({ availableFamilies: () => families() }));
vi.mock("@/lib/settings", async () => {
  const schema = await import("@/lib/settings-schema");
  return {
    ...schema,
    getSettings: async () => stored,
    saveSettings: (p: Partial<Settings>) => saved(p),
  };
});

const { saveSettingsGroup } = await import("@/app/admin/settings/actions");

/** One group's form, with a baseline that matches what is stored. */
function form(group: keyof typeof GROUP_FIELDS, fields: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set("_group", group);
  const baseline: Record<string, unknown> = {};
  for (const f of GROUP_FIELDS[group]) baseline[f as string] = (stored as never)[f as never];
  fd.set("_baseline", JSON.stringify(baseline));
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const patchOf = () => saved.mock.calls.at(-1)?.[0] as Partial<Settings>;

beforeEach(() => {
  stored = { ...SETTINGS_DEFAULTS, name: "Greater Inside" };
  saved.mockClear();
  families.mockClear();
  families.mockImplementation(async () => ["Lora"]);
});

describe("saving one settings group", () => {
  it("keeps an object field an object, instead of blanking it", async () => {
    // The whole reason JSON_FIELDS exists. Through the generic branch,
    // `shape.safeParse("{...}")` hands a string to an object schema, gets the
    // all-empty default back and writes it — every element's type gone, on a
    // save that changed the heading font.
    const type = { ...SITE_TYPOGRAPHY_DEFAULTS, h2: { ...SITE_TYPOGRAPHY_DEFAULTS.h2, weight: "700" } };
    const res = await saveSettingsGroup({}, form("typography", {
      headingFont: "Lora",
      bodyFont: "",
      siteTypography: JSON.stringify(type),
    }));
    expect(res.errors).toBeUndefined();
    expect(patchOf().siteTypography?.h2.weight).toBe("700");
  });

  it("leaves a stored object alone when the form did not carry it", async () => {
    await saveSettingsGroup({}, form("typography", { headingFont: "", bodyFont: "" }));
    expect(patchOf()).not.toHaveProperty("siteTypography");
  });

  it("says so rather than writing nonsense when the JSON is unreadable", async () => {
    const res = await saveSettingsGroup({}, form("shell", { siteShell: "{not json" }));
    expect(res.errors?.siteShell).toBeTruthy();
    expect(saved).not.toHaveBeenCalled();
  });

  it("notices somebody else changed the same object while this form was open", async () => {
    // `String(obj)` is "[object Object]" for every object, so before `asText`
    // the typography blob compared equal to any other and two admins editing it
    // silently overwrote each other — the exact case this check is for.
    const fd = form("shell", { siteShell: JSON.stringify(SITE_SHELL_DEFAULTS) });
    stored = { ...stored, siteShell: { ...SITE_SHELL_DEFAULTS, barColor: "#111111" } };
    const res = await saveSettingsGroup({}, fd);
    expect(res.errors?._form).toContain("Someone else changed");
    expect(saved).not.toHaveBeenCalled();
  });

  it("does not call a group that has not moved a conflict", async () => {
    const res = await saveSettingsGroup({}, form("shell", {
      siteShell: JSON.stringify({ ...SITE_SHELL_DEFAULTS, barColor: "#111111" }),
    }));
    expect(res.saved).toBe(true);
  });

  it("writes only the group's own fields, so one panel cannot blank another", async () => {
    await saveSettingsGroup({}, form("identity", { name: "Renamed", tagline: "New" }));
    expect(Object.keys(patchOf()).sort()).toEqual(["name", "tagline"]);
  });

  it("refuses a store with no name", async () => {
    const res = await saveSettingsGroup({}, form("identity", { name: "  ", tagline: "x" }));
    expect(res.errors?.name).toBeTruthy();
    expect(saved).not.toHaveBeenCalled();
  });

  it("refuses a per-element family whose font is not installed", async () => {
    // A family with nothing behind it renders as the fallback, which reads as a
    // broken page rather than an unset setting. The two top-level fonts were
    // checked and the eleven per-element ones were not.
    const type = { ...SITE_TYPOGRAPHY_DEFAULTS, h1: { ...SITE_TYPOGRAPHY_DEFAULTS.h1, family: "Gone" } };
    const res = await saveSettingsGroup({}, form("typography", {
      headingFont: "",
      bodyFont: "",
      siteTypography: JSON.stringify(type),
    }));
    expect(res.errors?.siteTypography).toContain("Gone");
    expect(saved).not.toHaveBeenCalled();
  });

  it("accepts a per-element family that is installed", async () => {
    const type = { ...SITE_TYPOGRAPHY_DEFAULTS, h1: { ...SITE_TYPOGRAPHY_DEFAULTS.h1, family: "Lora" } };
    const res = await saveSettingsGroup({}, form("typography", {
      headingFont: "",
      bodyFont: "",
      siteTypography: JSON.stringify(type),
    }));
    expect(res.errors).toBeUndefined();
    expect(patchOf().siteTypography?.h1.family).toBe("Lora");
  });

  it("refuses a group it does not know", async () => {
    const fd = new FormData();
    fd.set("_group", "made-up");
    expect((await saveSettingsGroup({}, fd)).errors?._form).toBeTruthy();
  });

  it("parses the JSON through the same schema the page renders from", async () => {
    // Not `JSON.parse` and store: these strings come from a browser and end up
    // in a <style> element on every page of the store.
    const res = await saveSettingsGroup({}, form("shell", {
      siteShell: JSON.stringify({ ...SITE_SHELL_DEFAULTS, barColor: "red; } body { display:none" }),
    }));
    expect(res.saved).toBe(true);
    expect(patchOf().siteShell?.barColor).toBe("");
    expect(SETTINGS_SCHEMA.shape.siteShell).toBeTruthy();
  });
});

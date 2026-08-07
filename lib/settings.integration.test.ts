import { describe, it, expect, afterAll } from "vitest";
import { getSettings, saveSettings } from "@/lib/settings";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

// Real Postgres. Skips without a service-role key — a public URL cannot write.
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * The merge is the whole safety property of this page.
 *
 * Groups save independently, so a write that replaced the settings blob would
 * mean saving Legal silently wiped Brand — with no error, and nothing on screen
 * to suggest anything had gone. The previous writer did exactly that, which is
 * why it was deleted rather than extended.
 */

let original: Record<string, unknown> | null = null;

async function snapshot() {
  const db = createServiceClient();
  const { data } = await db.from("stores").select("settings").eq("id", await getStoreId()).single();
  return (data?.settings ?? {}) as Record<string, unknown>;
}

afterAll(async () => {
  if (!canRun || original === null) return;
  // Put the store back exactly as it was — this runs against a real row.
  const db = createServiceClient();
  await db.from("stores").update({ settings: original }).eq("id", await getStoreId());
});

describe.skipIf(!canRun)("saving one group", () => {
  it("leaves every other group alone", async () => {
    original ??= await snapshot();

    await saveSettings({ primaryColor: "#123456", metaTitle: "Kept" });
    await saveSettings({ governingLaw: "England and Wales" });

    const after = await getSettings();
    expect(after.governingLaw).toBe("England and Wales");
    // The brand and SEO values were written by an earlier save and named
    // nowhere in the later one. A replacing write loses both here.
    expect(after.primaryColor).toBe("#123456");
    expect(after.metaTitle).toBe("Kept");
  });

  it("falls back to the code default for anything never saved", async () => {
    original ??= await snapshot();
    const db = createServiceClient();
    await db.from("stores").update({ settings: {} }).eq("id", await getStoreId());

    const s = await getSettings();
    expect(s.refundWindowDays).toBe(14);
    expect(s.address).toBe("");
    // The store still has its name: it is a column, not a settings key, so
    // emptying the blob must not blank it.
    expect(s.name.length).toBeGreaterThan(0);
  });

  it("keeps the good fields when one stored value is nonsense", async () => {
    original ??= await snapshot();
    const db = createServiceClient();
    await db
      .from("stores")
      .update({ settings: { primaryColor: "not-a-colour", governingLaw: "Scotland" } })
      .eq("id", await getStoreId());

    // A settings row is not worth taking the whole shop down for.
    const s = await getSettings();
    expect(s.governingLaw).toBe("Scotland");
    expect(s.primaryColor).toBe("#b4472b");
  });
});

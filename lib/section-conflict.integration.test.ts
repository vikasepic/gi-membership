import { describe, it, expect, afterAll } from "vitest";
import { saveSection, getPageSections, StaleSectionError } from "@/lib/pages";
import { createServiceClient } from "@/lib/supabase/server";

// Real Postgres. Skips without a service-role key — a public URL cannot write.
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Two people on one section.
 *
 * Before this, the second save simply overwrote the first and neither person
 * ever found out. The presence warning is the friendly half; this is the half
 * that actually stops the loss, so it is the half worth testing against a real
 * database — the check lives in the WHERE clause, not in JavaScript.
 */
const OWNER = "product" as const;
const OWNER_ID = "00000000-0000-0000-0000-00000000f001";

const input = (headline: string) => ({
  enabled: true,
  style: "paper",
  accent: null,
  variant: null,
  content: { headline },
  background: null,
  cssId: "",
  cssClass: "",
});

const stampOf = async () =>
  (await getPageSections(OWNER, OWNER_ID)).find((r) => r.sectionKey === "problem")?.updatedAt ?? null;

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  await db.from("page_sections").delete().eq("owner_id", OWNER_ID);
});

describe.skipIf(!canRun)("saving a section someone else has changed", () => {
  it("lets the first save through and hands back a new stamp", async () => {
    const stamp = await saveSection(OWNER, OWNER_ID, "problem", input("First"), null);
    expect(stamp).toBeTruthy();
  });

  it("refuses a write built on a stamp that has moved", async () => {
    const stale = await stampOf();
    expect(stale).toBeTruthy();

    // Somebody else saves in the meantime.
    await saveSection(OWNER, OWNER_ID, "problem", input("Theirs"), stale);

    // Our editor still holds the old stamp.
    await expect(saveSection(OWNER, OWNER_ID, "problem", input("Ours"), stale)).rejects.toBeInstanceOf(
      StaleSectionError,
    );

    // And theirs is what survived — the point of the whole exercise.
    const rows = await getPageSections(OWNER, OWNER_ID);
    expect((rows.find((r) => r.sectionKey === "problem")?.content as { headline: string }).headline).toBe(
      "Theirs",
    );
  });

  it("returns the stamp the database wrote, not the one we sent", async () => {
    // A BEFORE UPDATE trigger sets updated_at = now(). Returning our own value
    // would hand the editor a baseline that never matches, and every second
    // save would report a conflict with nobody.
    const before = await stampOf();
    const returned = await saveSection(OWNER, OWNER_ID, "problem", input("Again"), before);
    expect(returned).toBe(await stampOf());
    expect(returned).not.toBe(before);
  });

  it("saves twice in a row when the baseline is carried forward", async () => {
    let stamp = await stampOf();
    stamp = await saveSection(OWNER, OWNER_ID, "problem", input("One"), stamp);
    // The second save uses what the first returned, which is what the editor
    // now does. Without that step this throws.
    await expect(saveSection(OWNER, OWNER_ID, "problem", input("Two"), stamp)).resolves.toBeTruthy();
  });

  it("treats a first-ever save as no conflict", async () => {
    // A section with no row has nothing to lose, even with a stamp in hand.
    await expect(
      saveSection(OWNER, OWNER_ID, "hero", input("New"), new Date().toISOString()),
    ).resolves.toBeTruthy();
  });
});

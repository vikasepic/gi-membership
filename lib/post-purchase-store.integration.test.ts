import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getSequence, saveSequence } from "@/lib/post-purchase-store";
import { LAYOUT_DEFAULTS, starterDoc } from "@/lib/post-purchase-layout";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const owners: string[] = [];
const email = (subject: string, delayAmount = 2) => ({ id: null, delayAmount, delayUnit: "days" as const, subject, preheader: "", doc: starterDoc("X") });

describe.skipIf(!canRun)("saving a sequence (integration)", () => {
  it("an owner with nothing saved reads as off, default layout, no emails", async () => {
    const s = await getSequence("offer", crypto.randomUUID());
    expect(s).toEqual({ id: null, enabled: false, layout: LAYOUT_DEFAULTS, emails: [] });
  });

  it("saves, reads back in order, and keeps each email's id across saves", async () => {
    const owner = crypto.randomUUID();
    owners.push(owner);
    const first = await saveSequence({ ownerType: "offer", ownerId: owner, enabled: true, layout: LAYOUT_DEFAULTS, emails: [email("A"), email("B"), email("C")] });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const read = await getSequence("offer", owner);
    expect(read.emails.map((e) => e.subject)).toEqual(["A", "B", "C"]);
    expect(read.emails[0].delayAmount).toBe(0); // email 1 has no delay of its own

    // Reorder C before B and delete A, in one save.
    const [, b, c] = read.emails;
    const second = await saveSequence({ ownerType: "offer", ownerId: owner, enabled: true, layout: LAYOUT_DEFAULTS, emails: [c, b] });
    expect(second.ok).toBe(true);
    const after = await getSequence("offer", owner);
    expect(after.emails.map((e) => [e.subject, e.id])).toEqual([["C", c.id], ["B", b.id]]);
  });

  it("an id from another sequence is treated as new, never moved across", async () => {
    const o1 = crypto.randomUUID();
    const o2 = crypto.randomUUID();
    owners.push(o1, o2);
    await saveSequence({ ownerType: "offer", ownerId: o1, enabled: false, layout: LAYOUT_DEFAULTS, emails: [email("mine")] });
    const theirs = (await getSequence("offer", o1)).emails[0];
    await saveSequence({ ownerType: "product", ownerId: o2, enabled: false, layout: LAYOUT_DEFAULTS, emails: [{ ...theirs, subject: "copied" }] });
    expect((await getSequence("offer", o1)).emails[0].subject).toBe("mine");
    expect((await getSequence("product", o2)).emails[0].id).not.toBe(theirs.id);
  });

  it("keeps the store series' first delay: every store email follows the welcome", async () => {
    // A random owner, never this store's own id, so a developer's local store series is never touched.
    const owner = crypto.randomUUID();
    owners.push(owner);
    const r = await saveSequence({ ownerType: "store", ownerId: owner, enabled: true, layout: LAYOUT_DEFAULTS, emails: [email("First", 3)] });
    expect(r.ok).toBe(true);
    expect((await getSequence("store", owner)).emails[0].delayAmount).toBe(3);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const o of owners) await db.from("post_purchase_sequences").delete().eq("owner_id", o);
});

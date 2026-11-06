import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { createMember } from "@/lib/members";

/** change_member_email (0099): the store's rows move together, in place. */
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const stamp = Date.now();
const oldEmail = `zz-email-change-old-${stamp}@example.test`;
const newEmail = `zz-email-change-new-${stamp}@example.test`;
const otherEmail = `zz-email-change-other-${stamp}@example.test`;
const userIds: string[] = [];
const jobIds: string[] = [];

describe.skipIf(!canRun)("change_member_email (integration)", () => {
  afterAll(async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();
    await db.from("error_events").delete().in("id", jobIds);
    await db.from("orders").delete().in("user_id", userIds);
    await db.from("trial_history").delete().eq("store_id", storeId).in("email", [oldEmail, newEmail]);
    await db.from("users").delete().in("id", userIds);
    for (const id of userIds) await db.auth.admin.deleteUser(id);
  });

  it("moves the member and their orders, copies trial history, and is a no-op the second time", async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();
    const m = await createMember({ email: oldEmail });
    if (!m.ok) throw new Error(m.error);
    userIds.push(m.userId);
    const { error: oErr } = await db.from("orders").insert({ store_id: storeId, email: oldEmail, user_id: m.userId, status: "paid", livemode: false });
    if (oErr) throw new Error(oErr.message);
    await db.from("trial_history").insert({ store_id: storeId, email: oldEmail, grant_key: "zz-key" });
    // A queued app grant for the old address, which must follow the person.
    const { data: job } = await db
      .from("error_events")
      .insert({ store_id: storeId, source: "zz-test", message: "zz", job_kind: "app_entitlement", job_payload: { email: oldEmail, appId: "x" }, next_attempt_at: new Date(Date.now() + 864e5).toISOString() })
      .select("id")
      .single();
    jobIds.push(job!.id as string);

    const { data: was, error } = await db.rpc("change_member_email", { p_user_id: m.userId, p_new: newEmail });
    expect(error).toBeNull();
    expect(was).toBe(oldEmail);

    const { data: user } = await db.from("users").select("id, email").eq("id", m.userId).single();
    expect(user!.email).toBe(newEmail);
    const { data: orders } = await db.from("orders").select("email").eq("user_id", m.userId);
    expect(orders!.map((o) => o.email)).toEqual([newEmail]);
    const { data: trials } = await db.from("trial_history").select("email").eq("store_id", storeId).eq("grant_key", "zz-key").order("email");
    expect(trials!.map((t) => t.email).sort()).toEqual([newEmail, oldEmail].sort());

    const { data: moved } = await db.from("error_events").select("job_payload").eq("id", job!.id).single();
    expect((moved!.job_payload as { email: string }).email).toBe(newEmail);

    const again = await db.rpc("change_member_email", { p_user_id: m.userId, p_new: newEmail });
    expect(again.error).toBeNull();
    expect(again.data).toBe(newEmail);
  });

  it("refuses an address another member already has, and moves nothing", async () => {
    const db = createServiceClient();
    const other = await createMember({ email: otherEmail });
    if (!other.ok) throw new Error(other.error);
    userIds.push(other.userId);

    const { error } = await db.rpc("change_member_email", { p_user_id: other.userId, p_new: newEmail });
    expect(error?.code).toBe("23505");
    const { data } = await db.from("users").select("email").eq("id", other.userId).single();
    expect(data!.email).toBe(otherEmail);
  });
});

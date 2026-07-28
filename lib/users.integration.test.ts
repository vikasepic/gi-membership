import { describe, it, expect, afterAll } from "vitest";
import { ensureUserProfile } from "@/lib/users";
import { createServiceClient } from "@/lib/supabase/server";

const canRun = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
const createdIds: string[] = [];

describe.skipIf(!canRun)("ensureUserProfile (integration)", () => {
  it("backfills a profile for an auth user created outside checkout, idempotently", async () => {
    // Exactly how the admin account was made: auth only, no profile row.
    const db = createServiceClient();
    const email = `authonly_${Date.now()}@example.com`;
    const created = await db.auth.admin.createUser({
      email,
      password: "password12345",
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    createdIds.push(userId);

    const before = await db.from("users").select("id").eq("id", userId).maybeSingle();
    expect(before.data).toBeNull(); // the state that broke checkout

    const profile = await ensureUserProfile(userId);
    expect(profile?.email).toBe(email);

    const after = await db.from("users").select("id, email").eq("id", userId).maybeSingle();
    expect(after.data?.email).toBe(email);

    // Calling again must not fail or duplicate.
    expect((await ensureUserProfile(userId))?.email).toBe(email);
    const rows = await db.from("users").select("id").eq("id", userId);
    expect(rows.data).toHaveLength(1);
  });

  it("returns null for an id with no auth user, rather than inventing one", async () => {
    expect(await ensureUserProfile("00000000-0000-0000-0000-0000000000ff")).toBeNull();
  });
});

afterAll(async () => {
  const db = createServiceClient();
  for (const id of createdIds) {
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
});

import { describe, it, expect, afterAll, vi } from "vitest";

// Real Postgres. Skips without a service-role key — a public URL cannot write.
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// The CRM push is best-effort and not what is under test here; stubbing it
// keeps this suite from depending on ActiveCampaign being configured.
vi.mock("@/lib/activecampaign", () => ({ syncContact: vi.fn(async () => "1") }));

const { createServiceClient } = await import("@/lib/supabase/server");
const { getStoreId } = await import("@/lib/store");
const { getProfile, saveProfileName } = await import("@/lib/profile");
const { syncContact } = await import("@/lib/activecampaign");

const made: string[] = [];

async function makeMember(name: string | null) {
  const db = createServiceClient();
  const email = `profile-${Date.now()}-${made.length}@example.test`;
  const { data } = await db.auth.admin.createUser({ email, email_confirm: true });
  const id = data.user!.id;
  made.push(id);
  await db.from("users").insert({ id, store_id: await getStoreId(), email, username: name });
  return { id, email };
}

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of made) {
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
});

describe.skipIf(!canRun)("a member's own details", () => {
  it("reads the name the checkout collected", async () => {
    const { id } = await makeMember("Mary Anne van der Berg");
    expect((await getProfile(id))?.fullName).toBe("Mary Anne van der Berg");
  });

  it("gives back an empty name rather than null for an account with none", async () => {
    // The field renders this straight into an input, so null would print
    // "null" in the box someone is about to correct.
    const { id } = await makeMember(null);
    expect((await getProfile(id))?.fullName).toBe("");
  });

  it("writes the correction everywhere the name is held", async () => {
    const { id, email } = await makeMember("Jnae Cooepr");
    await saveProfileName(id, "  Jane Cooper  ");

    expect((await getProfile(id))?.fullName).toBe("Jane Cooper");

    // The auth copy is what a feature reading the auth record would pick up.
    const db = createServiceClient();
    const { data } = await db.auth.admin.getUserById(id);
    expect(data.user?.user_metadata?.full_name).toBe("Jane Cooper");

    // And the CRM, or the correction reaches every part of this store and none
    // of their inbox.
    expect(syncContact).toHaveBeenCalledWith({ email, fullName: "Jane Cooper" });
  });
});

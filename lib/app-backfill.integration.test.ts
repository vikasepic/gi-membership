import { describe, it, expect, afterAll, vi } from "vitest";

// Real Postgres. Skips without a service-role key — a public URL cannot write.
const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// Nothing may actually leave the machine in a test. This is the call that
// reaches another company's server.
const sent: unknown[] = [];
vi.mock("@/lib/apps", async (orig) => ({
  ...(await orig<typeof import("@/lib/apps")>()),
  notifyAppEntitlement: vi.fn(async (args: unknown) => {
    sent.push(args);
    return { ok: true as const };
  }),
}));

const { createServiceClient } = await import("@/lib/supabase/server");
const { getStoreId } = await import("@/lib/store");
const { planNameBackfill, runNameBackfill } = await import("@/lib/app-backfill");

const APP_ID = "00000000-0000-0000-0000-0000000000a1"; // Content Engine, seeded
const made: { users: string[]; ownership: string[] } = { users: [], ownership: [] };

async function member(name: string | null, status: string) {
  const db = createServiceClient();
  const email = `backfill-${Date.now()}-${made.users.length}@example.test`;
  const { data } = await db.auth.admin.createUser({ email, email_confirm: true });
  const id = data.user!.id;
  made.users.push(id);
  await db.from("users").insert({ id, store_id: await getStoreId(), email, username: name });
  const { data: own, error } = await db
    .from("ownership")
    // `source` is not null and checked; omitting it fails the insert, and
    // supabase-js reports that in `error` rather than throwing.
    .insert({ user_id: id, store_id: await getStoreId(), app_id: APP_ID, status, source: "grant" })
    .select("id")
    .single();
  if (error) throw new Error(`seed ownership: ${error.message}`);
  made.ownership.push(own!.id as string);
  return { id, email };
}

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of made.ownership) await db.from("ownership").delete().eq("id", id);
  for (const id of made.users) {
    await db.from("users").delete().eq("id", id);
    await db.auth.admin.deleteUser(id);
  }
});

describe.skipIf(!canRun)("backfilling names to a connected app", () => {
  it("counts what it would send before sending anything", async () => {
    const before = await planNameBackfill(APP_ID);
    await member("Jane Cooper", "active");
    await member(null, "active");

    const after = await planNameBackfill(APP_ID);
    expect(after.total).toBe(before.total + 2);
    expect(after.named).toBe(before.named + 1);
    expect(after.unnamed).toBe(before.unnamed + 1);
  });

  it("sends only the ones it can actually name", async () => {
    sent.length = 0;
    const { email } = await member("Mary Anne van der Berg", "active");
    const { sent: n } = await runNameBackfill(APP_ID);

    const mine = sent.filter((s) => (s as { email: string }).email === email);
    expect(mine).toHaveLength(1);
    expect((mine[0] as { fullName: string }).fullName).toBe("Mary Anne van der Berg");
    expect(n).toBeGreaterThan(0);

    // A nameless entitlement is a network call that changes nothing at the far
    // end, and one more chance for a flaky endpoint to queue a pointless retry.
    for (const s of sent) {
      expect((s as { fullName: string | null }).fullName).toBeTruthy();
    }
  });

  it("re-sends a cancelled entitlement as cancelled", async () => {
    // The whole safety argument. This replays stored state, so it can never
    // hand access to somebody who does not already have it recorded here.
    sent.length = 0;
    const { email } = await member("Gone Away", "canceled");
    await runNameBackfill(APP_ID);

    const mine = sent.find((s) => (s as { email: string }).email === email) as {
      status: string;
    };
    expect(mine.status).toBe("canceled");
  });
});

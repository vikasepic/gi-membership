import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const owners: string[] = [];

/**
 * The CHECK constraints are invisible to tsc and vitest's unit tests
 * (AGENTS.md). This saves real rows so a constraint that refuses a legal
 * value, or allows an illegal one, fails here and not on the owner's Save.
 */
describe.skipIf(!canRun)("post-purchase tables (integration)", () => {
  async function sequence() {
    const db = createServiceClient();
    const owner = crypto.randomUUID();
    owners.push(owner);
    const { data, error } = await db
      .from("post_purchase_sequences")
      .insert({ store_id: await getStoreId(), owner_type: "offer", owner_id: owner })
      .select("id, enabled, store_id")
      .single();
    if (error) throw new Error(error.message);
    return data as { id: string; enabled: boolean; store_id: string };
  }

  it("a new sequence is off", async () => {
    expect((await sequence()).enabled).toBe(false);
  });

  it("one sequence per owner", async () => {
    const db = createServiceClient();
    const owner = crypto.randomUUID();
    owners.push(owner);
    const row = { store_id: await getStoreId(), owner_type: "product", owner_id: owner };
    expect((await db.from("post_purchase_sequences").insert(row)).error).toBeNull();
    expect((await db.from("post_purchase_sequences").insert(row)).error?.code).toBe("23505");
  });

  it("accepts hours and days, and refuses anything else", async () => {
    const db = createServiceClient();
    const s = await sequence();
    const ok = await db.from("post_purchase_emails").insert({ sequence_id: s.id, position: 1, delay_amount: 2, delay_unit: "hours" });
    expect(ok.error).toBeNull();
    const bad = await db.from("post_purchase_emails").insert({ sequence_id: s.id, position: 2, delay_amount: 1, delay_unit: "weeks" });
    expect(bad.error?.code).toBe("23514");
  });

  it("refuses an owner type that is not offer or product", async () => {
    const db = createServiceClient();
    const r = await db.from("post_purchase_sequences").insert({ store_id: await getStoreId(), owner_type: "course", owner_id: crypto.randomUUID() });
    expect(r.error?.code).toBe("23514");
  });

  it("lets positions swap inside one statement (the unique check is deferred)", async () => {
    const db = createServiceClient();
    const s = await sequence();
    const { data } = await db
      .from("post_purchase_emails")
      .insert([
        { sequence_id: s.id, position: 1 },
        { sequence_id: s.id, position: 2 },
      ])
      .select("id, position")
      .order("position");
    const [a, b] = data as { id: string; position: number }[];
    const swap = await db.from("post_purchase_emails").upsert([
      { id: a.id, sequence_id: s.id, position: 2 },
      { id: b.id, sequence_id: s.id, position: 1 },
    ]);
    expect(swap.error).toBeNull();
  });

  it("accepts a store series", async () => {
    const db = createServiceClient();
    const owner = crypto.randomUUID();
    owners.push(owner);
    const r = await db.from("post_purchase_sequences").insert({ store_id: await getStoreId(), owner_type: "store", owner_id: owner });
    expect(r.error).toBeNull();
  });

  async function flow(sequenceId: string, email: string) {
    return createServiceClient()
      .from("post_purchase_flows")
      .insert({ store_id: await getStoreId(), sequence_id: sequenceId, email })
      .select("id, status, run")
      .single();
  }

  it("one flow per buyer per sequence, running and run 1 by default", async () => {
    const s = await sequence();
    const first = await flow(s.id, "zz-flow@example.com");
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ status: "running", run: 1 });
    expect((await flow(s.id, "zz-flow@example.com")).error?.code).toBe("23505");
  });

  it("refuses a buyer email that is not trimmed and lower-cased", async () => {
    const s = await sequence();
    expect((await flow(s.id, "Zz-Flow@example.com")).error?.code).toBe("23514");
    expect((await flow(s.id, " zz-flow@example.com")).error?.code).toBe("23514");
  });

  it("one send per flow, run and step", async () => {
    const db = createServiceClient();
    const s = await sequence();
    const f = (await flow(s.id, "zz-steps@example.com")).data!;
    const row = (run: number, position: number) => ({
      store_id: s.store_id, flow_id: f.id, run, sequence_id: s.id, position, to_email: "zz-steps@example.com", due_at: new Date().toISOString(),
    });
    expect((await db.from("post_purchase_sends").insert(row(1, 1))).error).toBeNull();
    expect((await db.from("post_purchase_sends").insert(row(1, 1))).error?.code).toBe("23505");
    expect((await db.from("post_purchase_sends").insert(row(2, 1))).error).toBeNull();
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  // Emails, flows and sends go with their sequence (on delete cascade).
  for (const o of owners) await db.from("post_purchase_sequences").delete().eq("owner_id", o);
});

// lib/visits-milestones.integration.test.ts
import { describe, it, expect, afterAll, vi } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const REQ = vi.hoisted(() => ({ headers: new Map<string, string>(), cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => REQ.headers.get(k.toLowerCase()) ?? null }),
  cookies: async () => ({ get: (k: string) => (REQ.cookies.has(k) ? { value: REQ.cookies.get(k) } : undefined) }),
}));

const { recordVisit, currentVisitId, recordVisitStep } = await import("@/lib/visits");

const anonIds: string[] = [];

describe.skipIf(!canRun)("milestones on a visit (integration)", () => {
  it("keeps each milestone once and carries the order and its value on the purchase", async () => {
    const anon = `zz-ms-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    anonIds.push(anon);
    REQ.headers = new Map([["x-pathname", "/p/zz"], ["user-agent", "Mozilla/5.0 (Macintosh) Chrome/130.0 Safari/537.36"]]);
    REQ.cookies = new Map([["gi_anon", anon]]);
    await recordVisit();
    const visitId = await currentVisitId();

    await recordVisitStep("checkout");
    await recordVisitStep("upsell");
    await recordVisitStep("purchase", { visitId, orderId: null, valueCents: 4900 });
    await recordVisitStep("purchase", { visitId, orderId: null, valueCents: 9999 });

    const db = createServiceClient();
    const { data } = await db.from("visit_steps").select("step, value_cents").eq("visit_id", visitId!).order("step");
    expect(data!.map((s) => s.step).sort()).toEqual(["checkout", "purchase", "upsell"]);
    // The second purchase call must not overwrite the first with a different value.
    expect(data!.find((s) => s.step === "purchase")!.value_cents).toBe(4900);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  const { data } = await db.from("visits").select("id").in("anon_id", anonIds);
  for (const v of data ?? []) await db.from("visit_steps").delete().eq("visit_id", v.id);
  await db.from("visits").delete().in("anon_id", anonIds);
  void (await getStoreId());
});

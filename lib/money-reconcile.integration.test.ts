import { describe, it, expect, afterAll } from "vitest";

const { createServiceClient } = await import("@/lib/supabase/server");
const { recordMismatches } = await import("@/lib/money-reconcile");

/**
 * A mismatch is reported once and stays on /admin/errors until someone deals
 * with it, rather than adding a row every night it is still true.
 */

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const KEY = `refunded_here_not_in_stripe:zz-${Date.now()}`;

describe.skipIf(!canRun)("recording mismatches (integration)", () => {
  const rows = async () =>
    (await createServiceClient().from("error_events").select("id, resolved_at").eq("source", "money_reconcile").contains("context", { key: KEY })).data ?? [];
  const mismatch = { key: KEY, kind: "refunded_here_not_in_stripe" as const, message: "zz test mismatch", context: {} };

  it("records a new mismatch once, however many nights it is found", async () => {
    expect(await recordMismatches([mismatch])).toBe(1);
    expect(await recordMismatches([mismatch])).toBe(0);
    expect(await rows()).toHaveLength(1);
  });

  it("reports it again once the row is resolved but the mismatch is still there", async () => {
    // Resolving should mean fixing. A mismatch still true the next night is news.
    const [row] = await rows();
    await createServiceClient().from("error_events").update({ resolved_at: new Date().toISOString() }).eq("id", row.id);
    expect(await recordMismatches([mismatch])).toBe(1);
  });
});

afterAll(async () => {
  if (!canRun) return;
  await createServiceClient().from("error_events").delete().eq("source", "money_reconcile").contains("context", { key: KEY });
});

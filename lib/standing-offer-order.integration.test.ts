import { describe, it, expect, afterEach } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { getStandingOffer } from "@/lib/library";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";

// Which offer the library puts under the one-tap button was whatever Postgres
// happened to hand back — the query had no `order by`. That is not a tie the
// database gets to break: it decides what a member is sold, and it moves when
// any unrelated offer row is written. It also made the offer checkout suite
// fail roughly one full-suite run in three, buying a *throwaway no-trial
// fixture* another suite had left live instead of the real subscription.
//
// The rows below are inserted newest-first so heap order disagrees with age.
describe.skipIf(!canRun)("the standing offer is chosen, not stumbled upon (integration)", () => {
  const made: string[] = [];
  let userId: string | null = null;

  afterEach(async () => {
    const db = createServiceClient();
    for (const id of made) await db.from("offers").delete().eq("id", id);
    made.length = 0;
    if (userId) await db.from("users").delete().eq("id", userId);
    userId = null;
  });

  it("offers the longest-standing eligible subscription, whatever the row order", async () => {
    const db = createServiceClient();
    const storeId = await getStoreId();

    userId = crypto.randomUUID();
    await db
      .from("users")
      .insert({ id: userId, store_id: storeId, email: `zz-standing-${userId}@example.test` });

    // Older than anything the store really sells, so the correct answer is one
    // of these and not the seeded offer — and inserted from newest to oldest,
    // so the row a scan reaches first is the wrong one.
    const ages = ["2002-01-01T00:00:00Z", "2001-01-01T00:00:00Z", "2000-01-01T00:00:00Z"];
    const ids: string[] = [];
    for (const created of ages) {
      const id = crypto.randomUUID();
      ids.push(id);
      made.push(id);
      const { error } = await db.from("offers").insert({
        id,
        store_id: storeId,
        key: `zz-standing-${id}`,
        name: `zz standing fixture ${created}`,
        grant_type: "subscription",
        grant_app_id: APP,
        grant_entitlement_key: "content-engine",
        grant_channels: [],
        billing_type: "recurring",
        interval: "month",
        interval_count: 1,
        trial_days: 7,
        price_cents: 2900,
        currency: "usd",
        headline: "fixture",
        description: "fixture",
        created_at: created,
      });
      if (error) throw new Error(`test fixture: offer: ${error.message}`);
    }
    const oldest = ids[ids.length - 1];

    expect((await getStandingOffer(userId))?.id).toBe(oldest);
  });
});

import { describe, it, expect, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId, getOffer } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const made: string[] = [];

async function fixture(extra: Record<string, unknown> = {}) {
  const db = createServiceClient();
  const id = crypto.randomUUID();
  made.push(id);
  const { error } = await db.from("offers").insert({
    id,
    store_id: await getStoreId(),
    key: `zz-bump-${id}`,
    name: "zz bump fixture",
    grant_type: "subscription",
    grant_app_id: APP,
    grant_entitlement_key: "content-engine",
    grant_channels: [],
    billing_type: "one_time",
    price_cents: 2900,
    currency: "usd",
    headline: "fixture",
    description: "fixture",
    ...extra,
  });
  return { id, error };
}

describe.skipIf(!canRun)("an offer's bump slot (integration)", () => {
  it("carries a bump offer and the prices to show", async () => {
    const target = await fixture();
    const host = await fixture({ bump_offer_id: target.id, bump_price_ids: [] });
    expect(host.error).toBeNull();
    const read = await getOffer(host.id);
    expect(read?.bumpOfferId).toBe(target.id);
    expect(read?.bumpPriceIds).toEqual([]);
  });

  it("refuses to bump itself", async () => {
    // Written because a CHECK that silently is not there looks exactly like
    // one that is. A self-bump would recurse in the charge path.
    const db = createServiceClient();
    const made1 = await fixture();
    const { error } = await db.from("offers").update({ bump_offer_id: made1.id }).eq("id", made1.id);
    expect(error?.message ?? "").toContain("offers_bump_not_self");
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const id of made) await db.from("offers").update({ bump_offer_id: null }).eq("id", id);
  for (const id of made) await db.from("offers").delete().eq("id", id);
});

import { describe, it, expect, afterEach, vi } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { rememberLead, markLeadConverted, flushDueLeads, LEAD_DELAY_MINUTES } from "@/lib/leads";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = () => createServiceClient();
const PRODUCT = "00000000-0000-0000-0000-0000000000b1";
const KEY = "test-visitor-key";

async function lead() {
  const { data } = await db()
    .from("checkout_leads")
    .select("email, full_name, sent_at, converted_at")
    .eq("visitor_key", KEY)
    .maybeSingle();
  return data;
}

/**
 * Insert a lead that is already old enough to be due.
 *
 * It has to be inserted rather than aged with an UPDATE: the set_updated_at
 * trigger stamps updated_at to now() on every update, which is exactly right
 * in production and makes "pretend this is old" impossible that way.
 */
async function oldLead(email: string, storeId: string) {
  await db().from("checkout_leads").insert({
    store_id: storeId,
    visitor_key: KEY,
    product_id: PRODUCT,
    email,
    updated_at: new Date(Date.now() - (LEAD_DELAY_MINUTES + 1) * 60_000).toISOString(),
  });
}

async function storeId(): Promise<string> {
  const { data } = await db().from("stores").select("id").limit(1).single();
  return data!.id as string;
}

afterEach(async () => {
  if (!canRun) return;
  vi.unstubAllEnvs();
  await db().from("checkout_leads").delete().eq("visitor_key", KEY);
});

describe.skipIf(!canRun)("checkout lead buffer (integration)", () => {
  it("keeps only the last address a session typed", async () => {
    await rememberLead({ visitorKey: KEY, productId: PRODUCT, email: "first@example.com" });
    await rememberLead({ visitorKey: KEY, productId: PRODUCT, email: "typo@gmial.com" });
    await rememberLead({ visitorKey: KEY, productId: PRODUCT, email: "final@example.com", fullName: "Jane Cooper" });

    const l = await lead();
    expect(l?.email).toBe("final@example.com");
    expect(l?.full_name).toBe("Jane Cooper");
    const { count } = await db()
      .from("checkout_leads")
      .select("id", { count: "exact", head: true })
      .eq("visitor_key", KEY);
    expect(count).toBe(1); // one row per visitor per product, not three
  });

  // The whole reason for the delay: a two-minute buyer must never reach the CRM.
  it("does not forward a lead that is younger than the delay", async () => {
    await rememberLead({ visitorKey: KEY, productId: PRODUCT, email: "fresh@example.com" });
    const res = await flushDueLeads();
    expect(res.forwarded).toBe(0);
    expect((await lead())?.sent_at).toBeNull();
  });

  it("forwards a lead that has sat unconverted past the delay", async () => {
    await oldLead("abandoner@example.com", await storeId());
    const res = await flushDueLeads();
    expect(res.forwarded).toBe(1);
    expect((await lead())?.sent_at).toBeTruthy();
  });

  it("never forwards a lead once they have bought", async () => {
    await oldLead("buyer@example.com", await storeId());
    await markLeadConverted("BUYER@example.com"); // case-insensitive on purpose

    const res = await flushDueLeads();
    expect(res.forwarded).toBe(0);
    const l = await lead();
    expect(l?.converted_at).toBeTruthy();
    expect(l?.sent_at).toBeNull();
  });

  it("forwards each lead only once", async () => {
    await oldLead("once@example.com", await storeId());
    expect((await flushDueLeads()).forwarded).toBe(1);
    // Second sweep: already sent, so nothing to do even though it is old.
    expect((await flushDueLeads()).forwarded).toBe(0);
  });

  it("refuses to store something that cannot be an address", async () => {
    await rememberLead({ visitorKey: KEY, productId: PRODUCT, email: "jane@gmail" });
    expect(await lead()).toBeNull();
  });
});

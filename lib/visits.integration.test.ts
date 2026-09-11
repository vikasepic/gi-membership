// lib/visits.integration.test.ts
import { describe, it, expect, afterAll, vi } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// The capture path reads the request through next/headers and next/cookies.
// Both are mocked per-test so one file can exercise a phone, a bot and a
// visitor with no cookie without standing up a server.
const REQ = vi.hoisted(() => ({ headers: new Map<string, string>(), cookies: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => REQ.headers.get(k.toLowerCase()) ?? null }),
  cookies: async () => ({ get: (k: string) => (REQ.cookies.has(k) ? { value: REQ.cookies.get(k) } : undefined) }),
}));

const { recordVisit, currentVisitId, recordVisitStep } = await import("@/lib/visits");

const UA_PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";
const anonIds: string[] = [];

function request(anon: string, over: Record<string, string> = {}) {
  REQ.headers = new Map(Object.entries({
    "x-pathname": "/p/zz-plan",
    "x-search": "?utm_source=meta&utm_campaign=ZZ%20Plan",
    "user-agent": UA_PHONE,
    "x-forwarded-for": "203.0.113.9",
    ...over,
  }));
  REQ.cookies = new Map(anon ? [["gi_anon", anon]] : []);
}

function fresh(tag: string) {
  const id = `zz-visit-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  anonIds.push(id);
  return id;
}

async function visitsFor(anon: string) {
  const db = createServiceClient();
  const { data } = await db
    .from("visits")
    .select("id, landing_path, landing_query, device, browser, os, ip_hash, utm_last, referrer, referrer_host, last_seen_at")
    .eq("anon_id", anon)
    .order("started_at", { ascending: true });
  return data ?? [];
}

describe.skipIf(!canRun)("recording a visit (integration)", () => {
  it("writes one row carrying the link, the campaign and the device", async () => {
    const anon = fresh("basic");
    request(anon, { referer: "https://l.facebook.com/l.php?u=abc" });
    await recordVisit();
    const rows = await visitsFor(anon);
    expect(rows).toHaveLength(1);
    expect(rows[0].landing_path).toBe("/p/zz-plan");
    // sanitizeQuery keeps the query verbatim (commit baadd66) — %20 stays
    // %20, it is never round-tripped through URLSearchParams into "+".
    expect(rows[0].landing_query).toBe("utm_source=meta&utm_campaign=ZZ%20Plan");
    expect(rows[0].device).toBe("phone");
    expect(rows[0].browser).toBe("Safari");
    expect(rows[0].os).toBe("iOS");
    expect(rows[0].referrer).toBe("https://l.facebook.com/l.php?u=abc");
    expect(rows[0].referrer_host).toBe("l.facebook.com");
    expect(rows[0].utm_last).toMatchObject({ utm_source: "meta", utm_campaign: "ZZ Plan" });
  });

  it("touches the same visit inside the window instead of opening a second", async () => {
    const anon = fresh("window");
    request(anon);
    await recordVisit();
    await recordVisit();
    const rows = await visitsFor(anon);
    expect(rows).toHaveLength(1);
  });

  it("opens a new visit once the window has passed", async () => {
    const anon = fresh("reopen");
    request(anon);
    await recordVisit();
    const db = createServiceClient();
    // Age the row past the 30-minute idle window rather than waiting for it.
    await db.from("visits").update({ last_seen_at: new Date(Date.now() - 31 * 60_000).toISOString() }).eq("anon_id", anon);
    await recordVisit();
    expect(await visitsFor(anon)).toHaveLength(2);
  });

  it("opens a visit from x-anon-id when the gi_anon cookie hasn't landed yet (I1)", async () => {
    // proxy.ts now forwards the anon id it just resolved as x-anon-id on the
    // request itself, ahead of the Set-Cookie the browser won't send back
    // until its NEXT request. This is that first request: the header is
    // there, the cookie jar is empty, exactly like a brand-new browser's
    // very first pageview.
    const anon = fresh("headeronly");
    REQ.headers = new Map(Object.entries({
      "x-pathname": "/p/zz-plan",
      "x-search": "?utm_source=meta&utm_campaign=ZZ%20Plan",
      "user-agent": UA_PHONE,
      "x-forwarded-for": "203.0.113.9",
      "x-anon-id": anon,
      referer: "https://l.facebook.com/l.php?u=abc",
    }));
    REQ.cookies = new Map(); // no gi_anon cookie on this request
    await recordVisit();
    const rows = await visitsFor(anon);
    expect(rows).toHaveLength(1);
    expect(rows[0].landing_path).toBe("/p/zz-plan");
    expect(rows[0].referrer).toBe("https://l.facebook.com/l.php?u=abc");
    expect(rows[0].referrer_host).toBe("l.facebook.com");
  });

  it("records nothing for a bot, and nothing without the anonymous cookie", async () => {
    const bot = fresh("bot");
    request(bot, { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" });
    await recordVisit();
    expect(await visitsFor(bot)).toHaveLength(0);

    const none = fresh("nocookie");
    request("");
    await recordVisit();
    expect(await visitsFor(none)).toHaveLength(0);
  });

  it("never hashes an address into the clear, and never stores one", async () => {
    const anon = fresh("ip");
    request(anon);
    await recordVisit();
    const [row] = await visitsFor(anon);
    // With no salt configured the column is null; with one it is a digest.
    if (row.ip_hash !== null) {
      expect(row.ip_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.ip_hash).not.toContain("203.0.113.9");
    }
  });

  it("records a milestone once, however many times it is called", async () => {
    const anon = fresh("step");
    request(anon);
    await recordVisit();
    const id = await currentVisitId();
    expect(id).toBeTruthy();
    await recordVisitStep("checkout");
    await recordVisitStep("checkout");
    const db = createServiceClient();
    const { data } = await db.from("visit_steps").select("id, step").eq("visit_id", id!);
    expect(data).toHaveLength(1);
    expect(data![0].step).toBe("checkout");
  });

  it("returns no visit id for a visitor who has none", async () => {
    request(fresh("empty"));
    expect(await currentVisitId()).toBeNull();
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

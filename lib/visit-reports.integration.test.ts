// lib/visit-reports.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { campaignRows, referrerRows, landingRows, recentVisits } from "@/lib/visit-reports";
import type { DayRange } from "@/lib/traffic-funnel";

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

// A far-future window nothing else in this database ever writes into, so
// counts can be pinned exactly instead of measured as a before/after delta.
const RANGE: DayRange = { start: "2031-06-10", end: "2031-06-12" };

const TS = Date.now();
const TAG = `zz-visitreports-${TS}`;
const CAMP_A = `${TAG}-camp-a`;
const CAMP_B = `${TAG}-camp-b`;
const HOST = `${TAG}-ref.example.com`;
const PATH = `/zz-landing-${TS}`;
const OTHER_HOST = `${TAG}-other.example.com`;
const OTHER_PATH = `/zz-other-${TAG}`;
// Every fixture not under test for a given dimension still needs SOME
// non-empty campaign, or it would fall into campaignRows' shared "direct"
// bucket and inflate the one count that test relies on being exactly 1.
const FILLER_UTM = { utm_source: "zz-filler", utm_medium: "cpc", utm_campaign: `${TAG}-filler` };

const visitIds: string[] = [];
let storeId = "";

// Ids of the fixtures individual tests need to name directly.
let campBVisitId = "";
let boundaryInId = "";
let boundaryOutId = "";

async function insertVisit(
  db: ReturnType<typeof createServiceClient>,
  over: {
    anon: string;
    startedAt: string;
    landingPath: string;
    referrerHost: string | null;
    utmLast: Record<string, string>;
  },
): Promise<string> {
  const { data, error } = await db
    .from("visits")
    .insert({
      store_id: storeId,
      anon_id: over.anon,
      started_at: over.startedAt,
      last_seen_at: over.startedAt,
      landing_path: over.landingPath,
      referrer_host: over.referrerHost,
      utm_last: over.utmLast,
    })
    .select("id")
    .single();
  if (error) throw new Error(`visit fixture (${over.anon}): ${error.message}`);
  const id = data!.id as string;
  visitIds.push(id);
  return id;
}

async function insertStep(
  db: ReturnType<typeof createServiceClient>,
  visitId: string,
  step: "checkout" | "purchase",
  valueCents: number | null,
) {
  const { error } = await db
    .from("visit_steps")
    .insert({ store_id: storeId, visit_id: visitId, step, value_cents: valueCents });
  if (error) throw new Error(`step fixture (${step}): ${error.message}`);
}

describe.skipIf(!canRun)("visit-reports (integration)", () => {
  beforeAll(async () => {
    const db = createServiceClient();
    storeId = await getStoreId();

    // Group A: campaignRows groups and totals. Two visits on the same
    // campaign, one of which bought.
    const a1 = await insertVisit(db, {
      anon: `${TAG}-a1`, startedAt: "2031-06-11T09:00:00.000Z", landingPath: OTHER_PATH,
      referrerHost: OTHER_HOST, utmLast: { utm_source: "meta", utm_medium: "cpc", utm_campaign: CAMP_A },
    });
    const a2 = await insertVisit(db, {
      anon: `${TAG}-a2`, startedAt: "2031-06-11T09:05:00.000Z", landingPath: OTHER_PATH,
      referrerHost: OTHER_HOST, utmLast: { utm_source: "meta", utm_medium: "cpc", utm_campaign: CAMP_A },
    });
    await insertStep(db, a2, "purchase", 4900);
    void a1;

    // Group B: the double-join proof. One visit carrying BOTH a checkout and
    // a purchase step — must count once in visits, once in orders, and its
    // revenue must not be doubled by the join fan-out.
    campBVisitId = await insertVisit(db, {
      anon: `${TAG}-b1`, startedAt: "2031-06-11T09:10:00.000Z", landingPath: OTHER_PATH,
      referrerHost: OTHER_HOST, utmLast: { utm_source: "meta", utm_medium: "cpc", utm_campaign: CAMP_B },
    });
    await insertStep(db, campBVisitId, "checkout", null);
    await insertStep(db, campBVisitId, "purchase", 4900);

    // Group C: direct traffic (no UTM labels at all) must appear as its own
    // row, not vanish from campaignRows.
    await insertVisit(db, {
      anon: `${TAG}-c1`, startedAt: "2031-06-11T09:15:00.000Z", landingPath: OTHER_PATH,
      referrerHost: OTHER_HOST, utmLast: {},
    });

    // Group D: the half-open date window. One visit at the range's start
    // midnight (included), one at the day-after-end midnight (excluded).
    boundaryInId = await insertVisit(db, {
      anon: `${TAG}-d1`, startedAt: `${RANGE.start}T00:00:00.000Z`, landingPath: OTHER_PATH,
      referrerHost: OTHER_HOST, utmLast: FILLER_UTM,
    });
    boundaryOutId = await insertVisit(db, {
      anon: `${TAG}-d2`, startedAt: "2031-06-13T00:00:00.000Z", landingPath: OTHER_PATH,
      referrerHost: OTHER_HOST, utmLast: FILLER_UTM,
    });

    // Group E: referrerRows groups by host. Two visits on the same host, one
    // of which bought.
    const e1 = await insertVisit(db, {
      anon: `${TAG}-e1`, startedAt: "2031-06-11T09:20:00.000Z", landingPath: OTHER_PATH,
      referrerHost: HOST, utmLast: FILLER_UTM,
    });
    const e2 = await insertVisit(db, {
      anon: `${TAG}-e2`, startedAt: "2031-06-11T09:25:00.000Z", landingPath: OTHER_PATH,
      referrerHost: HOST, utmLast: FILLER_UTM,
    });
    await insertStep(db, e2, "purchase", 4900);
    void e1;

    // Group F: a visit with no referrer at all appears under "direct".
    await insertVisit(db, {
      anon: `${TAG}-f1`, startedAt: "2031-06-11T09:30:00.000Z", landingPath: OTHER_PATH,
      referrerHost: null, utmLast: FILLER_UTM,
    });

    // Group G: landingRows groups by path. Two visits on the same path, one
    // of which bought.
    const g1 = await insertVisit(db, {
      anon: `${TAG}-g1`, startedAt: "2031-06-11T09:35:00.000Z", landingPath: PATH,
      referrerHost: OTHER_HOST, utmLast: FILLER_UTM,
    });
    const g2 = await insertVisit(db, {
      anon: `${TAG}-g2`, startedAt: "2031-06-11T09:40:00.000Z", landingPath: PATH,
      referrerHost: OTHER_HOST, utmLast: FILLER_UTM,
    });
    await insertStep(db, g2, "purchase", 4900);
    void g1;
  });

  afterAll(async () => {
    if (!canRun) return;
    const db = createServiceClient();
    // visit_steps references visits — delete it first or the FK blocks the rest.
    await db.from("visit_steps").delete().in("visit_id", visitIds);
    await db.from("visits").delete().in("id", visitIds);
  });

  it("campaignRows groups visits under one campaign and totals them", async () => {
    const rows = await campaignRows(RANGE);
    const row = rows.find((r) => r.campaign === CAMP_A);
    expect(row).toBeTruthy();
    expect(row).toEqual({
      source: "meta", medium: "cpc", campaign: CAMP_A, adset: "—", ad: "—",
      visits: 2, checkouts: 0, orders: 1, revenueCents: 4900,
    });
  });

  it("does not multiply a visit that carries both a checkout and a purchase step", async () => {
    // The proof the implementer ran by hand in psql and discarded instead of
    // committing. One visit reaching both milestones must count once in
    // visits, once in orders — not twice — and its revenue must not double.
    const rows = await campaignRows(RANGE);
    const row = rows.find((r) => r.campaign === CAMP_B);
    expect(row).toBeTruthy();
    expect(row).toEqual({
      source: "meta", medium: "cpc", campaign: CAMP_B, adset: "—", ad: "—",
      visits: 1, checkouts: 1, orders: 1, revenueCents: 4900,
    });
  });

  it("gives direct traffic (no UTM labels) its own row instead of dropping it", async () => {
    const rows = await campaignRows(RANGE);
    // Isolated to exactly this fixture: every other visit in the window
    // carries a non-empty campaign, so only the Group C visit falls here.
    const row = rows.find((r) => r.source === "direct" && r.campaign === "—");
    expect(row).toBeTruthy();
    expect(row).toMatchObject({ visits: 1, orders: 0, revenueCents: 0 });
  });

  it("is half-open: includes the range's start midnight, excludes the day after end's midnight", async () => {
    const visits = await recentVisits(RANGE, 200);
    const ids = visits.map((v) => v.id);
    expect(ids).toContain(boundaryInId);
    expect(ids).not.toContain(boundaryOutId);
  });

  it("referrerRows groups by host, and a visit with no referrer appears under direct", async () => {
    const rows = await referrerRows(RANGE);
    const hostRow = rows.find((r) => r.key === HOST);
    expect(hostRow).toBeTruthy();
    expect(hostRow).toEqual({ key: HOST, visits: 2, orders: 1, revenueCents: 4900 });

    // Isolated to exactly the Group F visit: every other fixture in the
    // window carries a non-null referrer host.
    const directRow = rows.find((r) => r.key === "direct");
    expect(directRow).toBeTruthy();
    expect(directRow).toMatchObject({ visits: 1, orders: 0, revenueCents: 0 });
  });

  it("landingRows groups by path", async () => {
    const rows = await landingRows(RANGE);
    const row = rows.find((r) => r.key === PATH);
    expect(row).toBeTruthy();
    expect(row).toEqual({ key: PATH, visits: 2, orders: 1, revenueCents: 4900 });
  });

  it("recentVisits returns a visit with its milestones attached, and respects its limit", async () => {
    const visits = await recentVisits(RANGE, 200);
    const withSteps = visits.find((v) => v.id === campBVisitId);
    expect(withSteps).toBeTruthy();
    expect(withSteps!.steps.map((s) => s.step).sort()).toEqual(["checkout", "purchase"]);
    const purchase = withSteps!.steps.find((s) => s.step === "purchase");
    expect(purchase?.valueCents).toBe(4900);

    // The window holds ten fixture visits (the eleventh sits outside it) —
    // comfortably more than the limit below, so a shorter list proves the
    // limit is applied rather than happening to match the fixture count.
    const limited = await recentVisits(RANGE, 3);
    expect(limited).toHaveLength(3);
  });
});

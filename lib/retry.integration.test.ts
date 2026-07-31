import { describe, it, expect, afterEach, vi } from "vitest";
import { createServiceClient } from "@/lib/supabase/server";
import { recordError, MAX_ATTEMPTS } from "@/lib/errors";
import { runDueJobs } from "@/lib/retry";

const canRun = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

const db = () => createServiceClient();

/**
 * Fail ONLY ActiveCampaign requests. Supabase's client uses fetch too, so a
 * blanket stub takes the database down with it and every assertion then reads
 * an empty row rather than the state under test.
 */
function failAcOnly() {
  const real = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("ac.test")) return new Response("boom", { status: 500 });
      return real(input as never, init);
    }),
  );
}

async function clear() {
  await db().from("error_events").delete().eq("source", "test_source");
}

async function row() {
  const { data } = await db()
    .from("error_events")
    .select("attempts, resolved_at, next_attempt_at, message")
    .eq("source", "test_source")
    .maybeSingle();
  return data;
}

/** Queue a job that is due immediately. */
async function queueDue(payload: Record<string, unknown>) {
  await recordError({
    source: "test_source",
    message: "initial failure",
    jobKind: "ac_tag",
    jobPayload: payload,
  });
  await db()
    .from("error_events")
    .update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() })
    .eq("source", "test_source");
}

afterEach(async () => {
  if (!canRun) return;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await clear();
});

describe.skipIf(!canRun)("retry sweep (integration)", () => {
  it("resolves a job once it succeeds", async () => {
    // ActiveCampaign unconfigured means tagContact reports ok without calling
    // out, which is exactly the "it worked this time" path.
    vi.stubEnv("ACTIVECAMPAIGN_API_URL", "");
    vi.stubEnv("ACTIVECAMPAIGN_API_TOKEN", "");
    await queueDue({ email: "a@b.com", tagIds: ["1"] });

    const res = await runDueJobs();
    expect(res.succeeded).toBe(1);
    expect((await row())?.resolved_at).toBeTruthy();
  });

  it("leaves a still-failing job unresolved and pushes the next attempt out", async () => {
    vi.stubEnv("ACTIVECAMPAIGN_API_URL", "https://ac.test");
    vi.stubEnv("ACTIVECAMPAIGN_API_TOKEN", "tok");
    failAcOnly();
    await queueDue({ email: "a@b.com", tagIds: ["1"] });

    await runDueJobs();
    const r = await row();
    expect(r?.resolved_at).toBeNull();
    expect(r?.attempts).toBe(1);
    // Scheduled forward, so the next sweep doesn't immediately pick it up again.
    expect(new Date(r!.next_attempt_at as string).getTime()).toBeGreaterThan(Date.now());
  });

  it("does not pick up a job that isn't due yet", async () => {
    await recordError({
      source: "test_source",
      message: "not due",
      jobKind: "ac_tag",
      jobPayload: { email: "a@b.com", tagIds: ["1"] },
    });
    const res = await runDueJobs();
    expect(res.attempted).toBe(0);
  });

  // Giving up must not mean forgetting: the row stays unresolved so it keeps
  // appearing in the admin list as something a human has to deal with.
  it("stops retrying after the last attempt but stays unresolved", async () => {
    vi.stubEnv("ACTIVECAMPAIGN_API_URL", "https://ac.test");
    vi.stubEnv("ACTIVECAMPAIGN_API_TOKEN", "tok");
    failAcOnly();
    await queueDue({ email: "a@b.com", tagIds: ["1"] });

    // Fast-forward past each backoff rather than waiting it out. Stop as soon
    // as the row stops being scheduled — forcing it due again is something only
    // the admin "try again now" button does, and doing it here would test a
    // path the cron cannot take.
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
      const before = await row();
      if (!before?.next_attempt_at) break;
      await db()
        .from("error_events")
        .update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() })
        .eq("source", "test_source")
        .is("resolved_at", null);
      await runDueJobs();
    }

    const r = await row();
    expect(r?.attempts).toBe(MAX_ATTEMPTS);
    expect(r?.resolved_at).toBeNull(); // gave up, but NOT forgotten
    expect(r?.next_attempt_at).toBeNull(); // no longer scheduled

    // And the sweep genuinely leaves it alone now.
    expect((await runDueJobs()).attempted).toBe(0);
  });

  it("records the failure reason so the admin page can show it", async () => {
    vi.stubEnv("ACTIVECAMPAIGN_API_URL", "https://ac.test");
    vi.stubEnv("ACTIVECAMPAIGN_API_TOKEN", "tok");
    failAcOnly();
    await queueDue({ email: "a@b.com", tagIds: ["1"] });
    await runDueJobs();
    expect((await row())?.message).toBeTruthy();
  });
});

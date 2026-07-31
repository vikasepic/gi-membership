import { NextResponse } from "next/server";
import { runDueJobs } from "@/lib/retry";
import { flushDueLeads } from "@/lib/leads";

export const dynamic = "force-dynamic";

// Retry sweep. Called by cron; not something a visitor should be able to
// trigger, so it needs the shared secret.
//
// Bearer rather than a query string: a secret in a URL ends up in access logs,
// proxy logs and browser history, which is the whole reason not to put one there.
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Leads first: a lead that fails to forward becomes a retry job, and
    // running the retries afterwards gives it its first attempt immediately
    // rather than five minutes later.
    const leads = await flushDueLeads();
    const jobs = await runDueJobs();
    return NextResponse.json({ ok: true, leads, jobs });
  } catch (e) {
    // The sweep itself failing must be visible to whatever called it, but it
    // must not take the route down — cron will come back in five minutes.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "sweep failed" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// visits older than this are gone; visit_steps follows by cascade (0080_visits.sql).
const RETENTION_DAYS = 400;

// Prune sweep. Called by cron; not something a visitor should be able to
// trigger, so it needs the shared secret — same gate as app/api/cron/retry,
// copied verbatim.
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
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
    const db = createServiceClient();
    const { data, error } = await db.from("visits").delete().lt("started_at", cutoff).select("id");
    if (error) throw error;
    return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "prune failed" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { backfillSubscriptions } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Re-read every subscription from Stripe. Run nightly, and once by hand
 * after migration 0086 to fill the table. Stripe is the truth; this keeps the
 * copy the admin reads from drifting when a webhook was missed.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if ((request.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await backfillSubscriptions()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "sync failed" }, { status: 500 });
  }
}

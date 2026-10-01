import { NextResponse } from "next/server";
import { reconcileMoney } from "@/lib/money-reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The nightly money check (lib/money-reconcile.ts): our orders against
 * Stripe. Mismatches go to /admin/errors.
 *
 * Same shared secret as the other crons, POST only. Read-only toward Stripe,
 * so safe to run any time. `?dry=1` reports and records nothing; `?days=N`
 * reads further back than the default three days.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const dryRun = params.get("dry") === "1";
  const days = Math.min(90, Math.max(1, Number(params.get("days")) || 3));
  try {
    return NextResponse.json({ ...(await reconcileMoney({ dryRun, days })), dryRun, days });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "reconcile failed" }, { status: 500 });
  }
}

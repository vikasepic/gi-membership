import { NextResponse } from "next/server";
import { backfillRenewals } from "@/lib/renewals";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One-off: book the renewals Stripe collected before the handler existed.
 *
 * A route rather than a script because everything it needs — the service key,
 * the Stripe key, the store id — is already in the running container's
 * environment, and a local script would need its own copy of all three.
 *
 * Same shared secret as the retry sweep, and POST only. It is idempotent, so
 * running it twice is a no-op rather than a second set of orders, but it is
 * still not something a visitor should be able to set off.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if ((request.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await backfillRenewals()) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "backfill failed" },
      { status: 500 },
    );
  }
}

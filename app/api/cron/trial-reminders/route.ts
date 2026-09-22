import { NextResponse } from "next/server";
import { sendDueTrialReminders } from "@/lib/trial-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The one-day trial reminder.
 *
 * Runs hourly. Stripe's own trial event fires a fixed three days out and
 * cannot be moved, so the timing is ours and this is what carries it.
 *
 * Same shared secret as the retry sweep, POST only. Safe to run twice: the
 * row is claimed before the send, so a second run in the same minute mails
 * nobody again. `?dry=1` counts who is due and sends nothing.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  try {
    return NextResponse.json({ ...(await sendDueTrialReminders({ dryRun })), dryRun });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "reminder sweep failed" },
      { status: 500 },
    );
  }
}

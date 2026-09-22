import { NextResponse } from "next/server";
import { backfillLifecycleTags } from "@/lib/ac-backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * One-off: give everyone the lifecycle tag their current state already earned.
 *
 * Tagging used to run only in `finalizeOrder`, so every offer bought on its
 * own page granted access without ever reaching ActiveCampaign. The live gap
 * is closed in `grantOfferOwnership`; this catches the people who bought
 * before that.
 *
 * A route rather than a script because the ActiveCampaign credentials and the
 * service key are already in the running container's environment.
 *
 * Same shared secret as the retry sweep, POST only. Idempotent: a tag someone
 * already carries is a no-op at ActiveCampaign's end. `?dry=1` counts who
 * would be tagged and sends nothing, which is worth doing first because a
 * real run starts nurture sequences for real people.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const result = await backfillLifecycleTags({ dryRun });
    return NextResponse.json({ ...result, dryRun });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "backfill failed" },
      { status: 500 },
    );
  }
}

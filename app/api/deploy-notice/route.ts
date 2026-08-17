import { NextResponse } from "next/server";
import { announceDeploy, currentNotice } from "@/lib/deploy-notice";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

/**
 * Raise a deploy warning. Called before a push, by whoever is pushing.
 *
 * Bearer rather than a query string, and the same CRON_SECRET the sweep uses
 * rather than a second secret to rotate: a secret in a URL ends up in access
 * logs, proxy logs and shell history, which is the whole reason not to put one
 * there.
 *
 * Deliberately NOT admin-session authenticated. The thing calling this is a
 * terminal about to run `git push`, not a browser.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if ((request.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    seconds?: number;
    backInMinutes?: number;
    source?: string;
  };

  try {
    const notice = await announceDeploy(body);
    return NextResponse.json({ ok: true, ...notice });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "could not announce" },
      { status: 500 },
    );
  }
}

/**
 * What the admin shell polls.
 *
 * Admin-only, because it says something about the shape of the deploy pipeline
 * and there is no reason for a buyer's browser to ask. Returns `null` rather
 * than a 404 when nothing is happening — which is almost always — so the client
 * has one shape to read and nothing to catch.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ notice: null }, { status: 401 });
  }
  return NextResponse.json({ notice: await currentNotice() });
}

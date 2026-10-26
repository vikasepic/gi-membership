import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recentBuyersFor } from "@/lib/recent-buyers-api";

// The recent buyers popup's cards for one page. Per person (it leaves out the
// viewer's own purchase), so never cached by a browser or a proxy.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    let viewerId: string | null = null;
    try {
      const { data } = await (await createClient()).auth.getUser();
      viewerId = data.user?.id ?? null;
    } catch {
      // Signed out, or no session to read: nobody to leave out.
    }
    const body = await recentBuyersFor(new URL(req.url).searchParams, viewerId);
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (e) {
    // A popup that fails says nothing. It sits on pages that take money.
    console.error("[recent-buyers] route failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ gapMs: 0, showMs: 5_000, cards: [] }, { headers: NO_STORE });
  }
}

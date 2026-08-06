import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { listMedia, KINDS, type MediaKind } from "@/lib/media-library";
import { withUrls } from "@/lib/media-urls";

// The library, for a picker that is already open inside some other form.
//
// A route rather than a prop: the picker appears on the product page, the
// course page, the curriculum and the page builder, and passing the whole
// library into every one of those would load it on every page whether anyone
// opened a picker or not.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requireAdmin();

  const url = new URL(req.url);
  const raw = url.searchParams.get("kind");
  // An unknown kind lists nothing rather than everything. A picker asking for
  // images must never be answered with PDFs because of a typo in a query.
  const kind = raw && raw in KINDS ? (raw as MediaKind) : undefined;
  if (raw && !kind) return NextResponse.json({ items: [] });

  const items = await withUrls(await listMedia(kind, url.searchParams.get("q") ?? undefined));
  return NextResponse.json({ items });
}

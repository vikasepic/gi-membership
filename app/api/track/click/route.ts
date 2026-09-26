import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { currentVisitId } from "@/lib/visits";

/**
 * A buy-button click from a sales page. See components/scroll-tracker.tsx.
 *
 * Same rules as the scroll route beside it: keyed on the visit from the
 * cookie, never the body, and every field clamped or truncated, because an
 * open endpoint is one somebody else can fill.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    path?: unknown;
    section?: unknown;
    sectionLabel?: unknown;
    button?: unknown;
  } | null;
  if (!body || typeof body.path !== "string" || !body.path.startsWith("/") || body.path.length > 200) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const button = typeof body.button === "string" ? body.button.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  if (!button) return Response.json({ ok: false }, { status: 400 });
  const section =
    typeof body.section === "number" && Number.isFinite(body.section)
      ? Math.min(59, Math.max(-1, Math.round(body.section)))
      : -1;

  try {
    const visitId = await currentVisitId();
    if (!visitId) return Response.json({ ok: true, stored: false });
    const db = createServiceClient();
    await db.from("visit_clicks").upsert(
      {
        store_id: await getStoreId(),
        visit_id: visitId,
        path: body.path.split("?")[0],
        section,
        section_label: typeof body.sectionLabel === "string" ? body.sectionLabel.slice(0, 60) : null,
        button,
      },
      { onConflict: "visit_id,path,section,button", ignoreDuplicates: true },
    );
    return Response.json({ ok: true, stored: true });
  } catch {
    return Response.json({ ok: true, stored: false });
  }
}

import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { currentVisitId } from "@/lib/visits";

/**
 * A scroll-depth beacon from a sales page. See components/scroll-tracker.tsx.
 *
 * Keyed on the visit the layout opened (cookie, never the body), so a caller
 * can say how far it scrolled but not whose visit that was. Everything is
 * clamped and truncated here: an open endpoint is one somebody else can fill.
 * Always 200 except for a body that is not the shape at all; a beacon has
 * nobody to read the answer.
 */
const MAX_SECTIONS = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    path?: unknown;
    section?: unknown;
    label?: unknown;
    labels?: unknown;
    sections?: unknown;
    depth?: unknown;
  } | null;
  if (!body || typeof body.path !== "string" || !body.path.startsWith("/") || body.path.length > 200) {
    return Response.json({ ok: false }, { status: 400 });
  }

  const int = (v: unknown, lo: number, hi: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : lo;
  const labels = Array.isArray(body.labels)
    ? body.labels.slice(0, MAX_SECTIONS).map((l) => (typeof l === "string" ? l.slice(0, 60) : ""))
    : [];

  try {
    const visitId = await currentVisitId();
    if (!visitId) return Response.json({ ok: true, stored: false });
    const db = createServiceClient();
    await db.rpc("record_scroll", {
      p_store: await getStoreId(),
      p_visit: visitId,
      p_path: body.path.split("?")[0],
      p_section: int(body.section, -1, MAX_SECTIONS - 1),
      p_label: typeof body.label === "string" ? body.label.slice(0, 60) : null,
      p_labels: labels,
      p_sections: int(body.sections, 0, MAX_SECTIONS),
      p_depth: int(body.depth, 0, 100),
    });
    return Response.json({ ok: true, stored: true });
  } catch {
    // Silent, like every other write in lib/visits.ts.
    return Response.json({ ok: true, stored: false });
  }
}

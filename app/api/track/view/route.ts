import { viewer, isViewingAs } from "@/lib/view-as";
import { recordMemberPageView } from "@/lib/member-activity";

/**
 * A page view from a signed-in member. See components/member-view-tracker.tsx.
 *
 * Keyed on the session, never the body: an open endpoint is one somebody else
 * can fill, so the only thing the body may choose is the path, and that is
 * clamped.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { path?: unknown } | null;
  if (!body || typeof body.path !== "string" || !body.path.startsWith("/") || body.path.length > 200) {
    return Response.json({ ok: false }, { status: 400 });
  }
  const user = await viewer();
  if (!user || (await isViewingAs())) return Response.json({ ok: true, stored: false });
  await recordMemberPageView({ userId: user.id, path: body.path.split("?")[0] });
  return Response.json({ ok: true, stored: true });
}

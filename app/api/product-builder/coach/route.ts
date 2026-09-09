import { accessRefused, internalAppAccess } from "@/lib/builtin-apps/access";
import { coachTurn } from "@/lib/builtin-apps/product-builder/coach";

export const dynamic = "force-dynamic";

/** One coaching turn, streamed back as server-sent events. */
export async function POST(req: Request) {
  const access = await internalAppAccess("micro-product-builder");
  if (!access.ok) return accessRefused(access.reason);

  const body = await req.json().catch(() => null);
  return coachTurn({
    userId: access.user.id,
    sessionId: typeof body?.session_id === "string" ? body.session_id : "",
    message: typeof body?.message === "string" ? body.message : "",
    skip: body?.skip === true,
  });
}

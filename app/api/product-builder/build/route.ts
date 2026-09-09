import { accessRefused, internalAppAccess } from "@/lib/builtin-apps/access";
import { buildDocument, isDocumentKind } from "@/lib/builtin-apps/product-builder/build";

export const dynamic = "force-dynamic";

/** Write the guide, or the worksheet pack from it, streamed back as it is written. */
export async function POST(req: Request) {
  const access = await internalAppAccess("micro-product-builder");
  if (!access.ok) return accessRefused(access.reason);

  const body = await req.json().catch(() => null);
  if (!isDocumentKind(body?.kind)) return Response.json({ error: "bad_request" }, { status: 400 });
  return buildDocument({
    userId: access.user.id,
    sessionId: typeof body?.session_id === "string" ? body.session_id : "",
    kind: body.kind,
  });
}

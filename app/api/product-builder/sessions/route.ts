import { accessRefused, internalAppAccess } from "@/lib/builtin-apps/access";
import { intakeMessage, titleFromText } from "@/lib/builtin-apps/product-builder/format";
import { createSession } from "@/lib/builtin-apps/product-builder/sessions";
import { INTAKE_LIMITS } from "@/lib/builtin-apps/product-builder/stages";

export const dynamic = "force-dynamic";

const oneLine = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Start a coaching session. The intake form's answers become the member's
 * first message, so the coach skips its opening question.
 */
export async function POST(req: Request) {
  const access = await internalAppAccess("micro-product-builder");
  if (!access.ok) return accessRefused(access.reason);

  const body = await req.json().catch(() => ({}));
  const who = oneLine(body?.who, INTAKE_LIMITS.who);
  const what = oneLine(body?.what, INTAKE_LIMITS.what);
  const last = typeof body?.last === "string" ? body.last.trim().slice(0, INTAKE_LIMITS.last) : "";
  const quick = body?.quick === true;

  const session = await createSession({
    userId: access.user.id,
    quick,
    title: what ? titleFromText(what) : null,
    intake: intakeMessage(who, what, last),
  });
  if (!session) return Response.json({ error: "internal_error" }, { status: 500 });
  return Response.json({ session });
}

import { accessRefused, internalAppAccess } from "@/lib/builtin-apps/access";
import { generateHooks, parseGenerateInput } from "@/lib/builtin-apps/hook-generator/generate";

export const dynamic = "force-dynamic";

/** Six hooks for a post idea. Takes 20 to 60 seconds; the browser waits. */
export async function POST(req: Request) {
  const access = await internalAppAccess("hook-generator");
  if (!access.ok) return accessRefused(access.reason);

  const parsed = parseGenerateInput(await req.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const outcome = await generateHooks(access.user.id, parsed.input);
  if (!outcome.ok) return Response.json({ error: outcome.error }, { status: outcome.status });
  return Response.json({ result: outcome.result, record: outcome.record });
}

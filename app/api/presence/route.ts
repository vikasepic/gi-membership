import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createClient } from "@/lib/supabase/server";
import { heartbeat, leave } from "@/lib/presence";

// Who has an editor open. Polled while one is; a route rather than an action
// because it runs on a timer and returns data rather than changing a page.
export const dynamic = "force-dynamic";

async function me() {
  await requireAdmin();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function target(body: unknown): { resource: string; resourceId: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const resource = String(b.resource ?? "").trim();
  const resourceId = String(b.resourceId ?? "").trim();
  // Bounded because they are stored, and unbounded strings from a client are
  // how a table becomes a place to put arbitrary data.
  if (!resource || !resourceId || resource.length > 40 || resourceId.length > 200) return null;
  return { resource, resourceId };
}

export async function POST(req: Request) {
  const userId = await me();
  if (!userId) return NextResponse.json({ editors: [] }, { status: 401 });

  const t = target(await req.json().catch(() => null));
  if (!t) return NextResponse.json({ error: "Bad target" }, { status: 400 });

  const editors = await heartbeat({ userId, ...t });
  return NextResponse.json({ editors });
}

export async function DELETE(req: Request) {
  const userId = await me();
  if (!userId) return NextResponse.json({ ok: true });

  const t = target(await req.json().catch(() => null));
  if (t) await leave({ userId, ...t });
  return NextResponse.json({ ok: true });
}

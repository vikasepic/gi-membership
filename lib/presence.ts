import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

/**
 * Who else has this open.
 *
 * A warning is only worth anything before the work is done, so this is read
 * while someone is editing rather than when they save. It does not prevent
 * anything — `savePageSection` and the settings groups refuse a stale write on
 * their own, and that is what actually stops one person's work disappearing.
 * This is the part that stops it being a surprise.
 *
 * Not a lock, on purpose. A lock held by a laptop someone shut is worse than an
 * overwrite: nobody can clear it, and the answer becomes "ask in Slack". A
 * heartbeat goes stale by itself.
 */

/** How long a heartbeat counts for. Comfortably more than the 20s interval. */
export const PRESENCE_TTL_SECONDS = 50;

export type Editor = { userId: string; name: string; seenAt: string };

/** Say "I am still here", and find out who else is. */
export async function heartbeat(args: {
  userId: string;
  resource: string;
  resourceId: string;
}): Promise<Editor[]> {
  const db = createServiceClient();
  const { error } = await db.from("editing_presence").upsert(
    {
      store_id: await getStoreId(),
      resource: args.resource,
      resource_id: args.resourceId,
      user_id: args.userId,
      seen_at: new Date().toISOString(),
    },
    { onConflict: "resource,resource_id,user_id" },
  );
  // A heartbeat that fails must not break the editor. The worst case is that
  // nobody is warned, which is exactly where this started.
  if (error) console.error(`[presence] heartbeat: ${error.message}`);
  return othersEditing(args);
}

/** Everyone but you, seen recently, most recent first. */
export async function othersEditing(args: {
  userId: string;
  resource: string;
  resourceId: string;
}): Promise<Editor[]> {
  const db = createServiceClient();
  const since = new Date(Date.now() - PRESENCE_TTL_SECONDS * 1000).toISOString();

  const { data } = await db
    .from("editing_presence")
    .select("user_id, seen_at")
    .eq("resource", args.resource)
    .eq("resource_id", args.resourceId)
    .neq("user_id", args.userId)
    .gt("seen_at", since)
    .order("seen_at", { ascending: false });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const { data: people } = await db
    .from("users")
    .select("id, username, email")
    .in("id", rows.map((r) => r.user_id as string));

  const nameOf = new Map(
    (people ?? []).map((p) => [
      p.id as string,
      ((p.username as string | null) ?? "").trim() || (p.email as string),
    ]),
  );

  return rows.map((r) => ({
    userId: r.user_id as string,
    name: nameOf.get(r.user_id as string) ?? "Someone",
    seenAt: r.seen_at as string,
  }));
}

/** Stop counting me as present — used when the editor closes. */
export async function leave(args: {
  userId: string;
  resource: string;
  resourceId: string;
}): Promise<void> {
  const db = createServiceClient();
  await db
    .from("editing_presence")
    .delete()
    .eq("resource", args.resource)
    .eq("resource_id", args.resourceId)
    .eq("user_id", args.userId);
}

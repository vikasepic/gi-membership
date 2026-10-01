import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

/**
 * What a signed-in member did (migration 0092): every store page they open,
 * and the library's "Still available" card when they click it.
 *
 * Neither writer throws. They run beside pages that take money, and a missing
 * log row must not cost the member the page or the purchase.
 */

export async function recordMemberPageView(v: { userId: string; path: string }): Promise<void> {
  try {
    const { error } = await createServiceClient()
      .from("member_page_views")
      .insert({ store_id: await getStoreId(), user_id: v.userId, path: v.path.slice(0, 200) });
    if (error) console.error("[member view] not logged:", error.message);
  } catch (e) {
    console.error("[member view] not logged:", e);
  }
}

export async function recordOfferClick(c: { userId: string; offerId: string | null; userAgent?: string | null }): Promise<void> {
  try {
    const { error } = await createServiceClient()
      .from("library_offer_clicks")
      .insert({ store_id: await getStoreId(), user_id: c.userId, offer_id: c.offerId, user_agent: c.userAgent?.slice(0, 400) ?? null });
    if (error) console.error("[library click] not logged:", error.message);
  } catch (e) {
    console.error("[library click] not logged:", e);
  }
}

export type MemberActivity =
  | { kind: "view"; at: string; path: string }
  | { kind: "click"; at: string; offerName: string | null };

/** One member's pages and clicks as one list, newest first. */
export async function activityFor(userId: string, limit = 150): Promise<MemberActivity[]> {
  const db = createServiceClient();
  const [{ data: views }, { data: clicks }] = await Promise.all([
    db.from("member_page_views").select("at, path").eq("user_id", userId).order("at", { ascending: false }).limit(limit),
    db.from("library_offer_clicks").select("at, offers(name)").eq("user_id", userId).order("at", { ascending: false }).limit(limit),
  ]);
  const rows: MemberActivity[] = [
    ...(views ?? []).map((v) => ({ kind: "view" as const, at: v.at as string, path: v.path as string })),
    ...(clicks ?? []).map((c) => ({
      kind: "click" as const,
      at: c.at as string,
      offerName: ((c.offers as { name?: string } | null)?.name as string | undefined) ?? null,
    })),
  ];
  return rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { allRows } from "@/lib/traffic";
import { publicCoverUrl } from "@/lib/media-url";
import { WINDOW_DAYS, type PurchaseRow } from "@/lib/recent-buyers";

// The purchases the recent buyers popup may name, for every page at once. The
// window is two weeks, tens of orders, and lib/recent-buyers.ts picks each
// page's share; reading it once lets a single cache entry serve them all.
//
// Everything that needs the database is decided here, and decided as an
// exclusion: a card naming a refund, a test payment, a renewal, the owner or
// someone who asked to be hidden is worse than no card.

type OrderRow = {
  id: string;
  user_id: string;
  created_at: string;
  buyer_country: string | null;
  order_items: { kind: string; offer_id: string | null; product_id: string | null; created_at: string }[];
};

const KINDS = new Set(["product", "bump", "oto"]);

/** Never throws: it runs behind a popup on pages that take money. */
export async function loadPurchaseRows(now: Date): Promise<PurchaseRow[]> {
  try {
    const db = createServiceClient();
    const storeId = await getStoreId();
    const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 3_600_000).toISOString();
    const orders = await allRows<OrderRow>((from, to) =>
      db
        .from("orders")
        .select("id, user_id, created_at, buyer_country, order_items(kind, offer_id, product_id, created_at)")
        .eq("store_id", storeId)
        .eq("status", "paid")
        .eq("livemode", true)
        // A renewal is the same buyer paying again, keyed on its invoice.
        .is("stripe_invoice_id", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    );
    if (orders.length === 0) return [];

    const userIds = [...new Set(orders.map((o) => o.user_id))];
    const items = orders.flatMap((o) => o.order_items.filter((i) => KINDS.has(i.kind)));
    const offerIds = [...new Set(items.map((i) => i.offer_id).filter(Boolean) as string[])];
    const [{ data: users }, { data: offerRows }] = await Promise.all([
      db.from("users").select("id, username, country, is_admin, hide_from_recent_buyers").in("id", userIds),
      offerIds.length > 0
        ? db
            .from("offers")
            .select("id, name, image_url, active, show_recent_buyers, grant_product_id, grant_app_id, interval")
            .in("id", offerIds)
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);
    const offerOf = new Map((offerRows ?? []).map((o) => [o.id as string, o]));
    const productIds = [
      ...new Set([
        ...(items.map((i) => i.product_id).filter(Boolean) as string[]),
        ...((offerRows ?? []).map((o) => o.grant_product_id).filter(Boolean) as string[]),
      ]),
    ];
    const { data: productRows } =
      productIds.length > 0
        ? await db
            .from("products")
            .select("id, title, type, cover_path, cover_image_url, status, show_recent_buyers")
            .in("id", productIds)
        : { data: [] as Record<string, unknown>[] };
    const productOf = new Map((productRows ?? []).map((p) => [p.id as string, p]));
    const userOf = new Map((users ?? []).map((u) => [u.id as string, u]));
    const coverOf = (p: Record<string, unknown> | undefined) =>
      p ? publicCoverUrl((p.cover_path as string | null) ?? null) ?? ((p.cover_image_url as string | null) ?? null) : null;

    const out: PurchaseRow[] = [];
    for (const o of orders) {
      const u = userOf.get(o.user_id);
      if (!u || u.is_admin || u.hide_from_recent_buyers) continue;
      // Oldest first within an order, so its main item comes before an upsell
      // added to it later (lib/recent-buyers.ts breaks ties on order seen).
      const own = o.order_items
        .filter((i) => KINDS.has(i.kind))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      for (const i of own) {
        const base = {
          orderId: o.id,
          userId: o.user_id,
          createdAt: o.created_at,
          username: (u.username as string | null) ?? null,
          country: o.buyer_country ?? ((u.country as string | null) ?? null),
          itemKind: i.kind as PurchaseRow["itemKind"],
        };
        if (i.offer_id) {
          const off = offerOf.get(i.offer_id);
          if (!off || !off.active || !off.show_recent_buyers) continue;
          const granted = off.grant_product_id ? productOf.get(off.grant_product_id as string) : undefined;
          out.push({
            ...base,
            offerId: i.offer_id,
            productId: null,
            // Counted toward the product's own page only while that page's
            // switch is on: the product's switch decides its page.
            grantProductId:
              granted && granted.status === "published" && granted.show_recent_buyers
                ? (off.grant_product_id as string)
                : null,
            itemName: off.name as string,
            imageUrl: publicCoverUrl((off.image_url as string | null) ?? null) ?? coverOf(granted),
            verb: off.grant_app_id || off.interval ? "joined" : "enrolled in",
          });
        } else if (i.product_id) {
          const p = productOf.get(i.product_id);
          if (!p || p.status !== "published" || !p.show_recent_buyers) continue;
          out.push({
            ...base,
            offerId: null,
            productId: i.product_id,
            grantProductId: null,
            itemName: p.title as string,
            imageUrl: coverOf(p),
            verb: p.type === "app" ? "joined" : "enrolled in",
          });
        }
      }
    }
    return out;
  } catch (e) {
    console.error("[recent-buyers] load failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";

// What the admin sidebar knows.
//
// The counts are the reason the sidebar is worth its width: "Apps 1/2" says one
// of two apps is not set up without opening Apps, and "Errors 3" is the only
// way that page ever gets visited. A nav that only lists names makes you go
// look at nine screens to find out nothing is wrong.

export type NavCounts = {
  products: number;
  courses: number;
  offers: number;
  orders: number;
  members: number;
  /** Connected out of total, because an app that is not set up sells nothing. */
  apps: { active: number; total: number };
  errors: number;
};

const ZERO: NavCounts = {
  products: 0, courses: 0, offers: 0, orders: 0, members: 0,
  apps: { active: 0, total: 0 }, errors: 0,
};

/**
 * One round trip per table, all in parallel, head-only.
 *
 * This runs on every admin page, so it counts rather than reads: `head: true`
 * asks Postgres for the number and returns no rows. A failure returns zeros
 * rather than throwing — a count is decoration on the navigation, and the
 * navigation has to render even when a table is unreachable.
 */
export async function navCounts(): Promise<NavCounts> {
  try {
    const db = createServiceClient();
    const storeId = await getStoreId();
    const n = async (table: string, scoped = true) => {
      const q = db.from(table).select("id", { count: "exact", head: true });
      const { count } = scoped ? await q.eq("store_id", storeId) : await q;
      return count ?? 0;
    };
    const [products, courses, offers, orders, members, appsTotal, appsActive, errors] =
      await Promise.all([
        n("products"), n("courses"), n("offers"), n("orders"), n("users"),
        n("apps"),
        db.from("apps").select("id", { count: "exact", head: true })
          .eq("store_id", storeId).eq("active", true).then((r) => r.count ?? 0),
        n("error_events"),
      ]);
    return {
      products, courses, offers, orders, members,
      apps: { active: appsActive, total: appsTotal },
      errors,
    };
  } catch {
    return ZERO;
  }
}

export type StoreTake = {
  /** Everything successfully charged. */
  takenCents: number;
  refundedCents: number;
  netCents: number;
  paid: number;
  refunded: number;
};

/**
 * What the store has actually taken.
 *
 * The Products page carried a "Revenue —" card whose whole content was the
 * words "see Orders". A card that sends you somewhere else costs a row of the
 * page to say nothing; this is the number it should have been showing, and it
 * is one query.
 */
export async function storeTake(): Promise<StoreTake> {
  const empty: StoreTake = { takenCents: 0, refundedCents: 0, netCents: 0, paid: 0, refunded: 0 };
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("orders")
      .select("status, total_cents")
      .eq("store_id", await getStoreId());
    if (error || !data) return empty;
    let takenCents = 0, refundedCents = 0, paid = 0, refunded = 0;
    for (const o of data as { status: string; total_cents: number }[]) {
      if (o.status === "paid") { takenCents += o.total_cents; paid++; }
      if (o.status === "refunded") { refundedCents += o.total_cents; refunded++; }
    }
    // Refunds are charges that were reversed, so they are part of what was
    // taken and then given back — not a separate pot.
    return { takenCents: takenCents + refundedCents, refundedCents, netCents: takenCents, paid, refunded };
  } catch {
    return empty;
  }
}

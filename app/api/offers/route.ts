import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { listOfferOptions } from "@/lib/admin";

/**
 * The store's offers, by name, for the builder's Ways to pay block.
 *
 * Admin only, and it hands back two fields — an id and a name. The block needs
 * to name an offer; it has no business knowing what any of them cost, and the
 * prices it eventually draws are resolved server-side when the page renders.
 *
 * Drafts included: an offer is usually built beside the page that sells it, and
 * a picker that hid the one you just made would be a picker you stop trusting.
 */
export async function GET() {
  await requireAdmin();
  const offers = await listOfferOptions(true);
  return NextResponse.json({
    offers: offers.map((o) => ({ id: o.id, name: o.active ? o.name : `${o.name} (draft)` })),
  });
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import { tagAbandonedForEmail } from "@/lib/ac-tags";
import { looksLikeEmail } from "@/lib/email-hint";

// Checkout emails are buffered here and forwarded to ActiveCampaign later, if
// they are still unconverted.
//
// Sending on blur meant a typo corrected ten seconds later had already created
// a junk contact, a two-minute buyer was tagged and untagged for nothing, and
// anyone could post addresses straight into the marketing list. The buffer
// fixes all three: corrections overwrite, fast buyers never leave the table,
// and abuse fills a table we own.

/**
 * How long an address sits before it is forwarded.
 *
 * Long enough to absorb a correction and a normal checkout, short enough that
 * the abandoned-cart email still arrives while the purchase is on their mind.
 * The ActiveCampaign automation adds its own wait on top.
 */
export const LEAD_DELAY_MINUTES = 15;

/**
 * Remember (or update) the address at this checkout.
 *
 * One row per visitor per product, so a session that types three addresses
 * keeps only the last — the correction wins, which is the point.
 */
export async function rememberLead(args: {
  visitorKey: string;
  productId: string;
  email: string;
  fullName?: string | null;
}): Promise<void> {
  const email = args.email.trim().toLowerCase();
  // Guard here as well as at the edge: this is the last point before an address
  // is stored, and storing junk means forwarding junk 15 minutes later.
  if (!looksLikeEmail(email)) return;

  const db = createServiceClient();
  await db.from("checkout_leads").upsert(
    {
      store_id: await getStoreId(),
      visitor_key: args.visitorKey,
      product_id: args.productId,
      email,
      full_name: args.fullName?.trim() || null,
      updated_at: new Date().toISOString(),
      // A returning visitor who abandoned, then came back and abandoned again,
      // should be forwarded again — so clear the previous send.
      sent_at: null,
      converted_at: null,
    },
    { onConflict: "store_id,visitor_key,product_id" },
  );
}

/**
 * They bought. Mark every lead for this email converted so none is forwarded.
 *
 * Matched on email rather than visitor key on purpose: someone can start on a
 * phone and finish on a laptop, and the two sessions have different keys but
 * the same buyer. The alternative is an abandoned-cart email to a customer,
 * which is the single most annoying thing this system could do.
 */
export async function markLeadConverted(email: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("checkout_leads")
    .update({ converted_at: new Date().toISOString() })
    .eq("store_id", await getStoreId())
    .eq("email", email.trim().toLowerCase())
    .is("converted_at", null);
}

export type LeadFlushResult = { forwarded: number; skipped: number };

/**
 * Forward every lead that has sat unconverted long enough. Called by the same
 * cron that drains the retry queue.
 */
export async function flushDueLeads(limit = 100): Promise<LeadFlushResult> {
  const db = createServiceClient();
  const cutoff = new Date(Date.now() - LEAD_DELAY_MINUTES * 60_000).toISOString();

  const { data: due } = await db
    .from("checkout_leads")
    .select("id, email, full_name, product_id")
    .eq("store_id", await getStoreId())
    .is("sent_at", null)
    .is("converted_at", null)
    .lte("updated_at", cutoff)
    .limit(limit);

  const result: LeadFlushResult = { forwarded: 0, skipped: 0 };

  for (const lead of due ?? []) {
    // Claim before sending, and only if still unsent, so two overlapping
    // sweeps cannot both forward the same address.
    const { data: claimed } = await db
      .from("checkout_leads")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", lead.id)
      .is("sent_at", null)
      .is("converted_at", null)
      .select("id");
    if (!claimed || claimed.length === 0) {
      result.skipped++;
      continue;
    }

    // tagAbandonedForEmail records and queues its own failures, so a bad send
    // is already retryable by the time this returns.
    await tagAbandonedForEmail({
      email: lead.email as string,
      fullName: (lead.full_name as string) ?? null,
      productId: lead.product_id as string,
    });
    result.forwarded++;
  }

  return result;
}

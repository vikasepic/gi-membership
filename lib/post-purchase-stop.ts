import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { otoSigningSecret, siteUrl } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * "Stop these emails" in a post-purchase follow-up.
 *
 * The token names one flow (a buyer on one sequence) and is signed with the
 * same secret as the preview and view-as tokens. No expiry: a buyer may open
 * an old email months later. Stopping pauses every flow for that buyer, not
 * only this one; their next purchase resumes them (lib/post-purchase-sequences.ts).
 */
const sign = (body: string) => createHmac("sha256", otoSigningSecret()).update(`pp-stop:${body}`).digest("base64url");

export function stopToken(flowId: string): string {
  const body = Buffer.from(flowId).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyStopToken(t: string | null | undefined): string | null {
  if (!t) return null;
  const [body, given] = t.split(".");
  if (!body || !given) return null;
  const a = Buffer.from(given);
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const id = Buffer.from(body, "base64url").toString();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function stopUrl(flowId: string): string {
  return `${siteUrl()}/email/stop?t=${stopToken(flowId)}`;
}

/**
 * Pause every running flow for one buyer and skip what is queued for them.
 * Safe to call again. Queued rows are skipped here, not left for the send
 * loop, so a purchase before they were due resumes cleanly at the next unsent
 * email. Used by the stop link and by a chargeback (lib/reversals.ts).
 */
export async function pauseFlowsForBuyer(storeId: string, email: string, reason: string): Promise<{ ok: boolean }> {
  const db = createServiceClient();
  const { data: paused, error: pauseErr } = await db
    .from("post_purchase_flows")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("store_id", storeId)
    // A buyer is their order email, trimmed and lower-cased (buyerKey).
    .eq("email", email.trim().toLowerCase())
    .eq("status", "running")
    .select("id");
  if (pauseErr) {
    console.error("[post-purchase stop] could not pause the flows:", pauseErr.message);
    return { ok: false };
  }
  const ids = ((paused ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length) {
    const { error: skipErr } = await db
      .from("post_purchase_sends")
      .update({ status: "skipped", reason })
      .in("flow_id", ids)
      .eq("status", "pending");
    if (skipErr) {
      console.error("[post-purchase stop] could not skip the queued emails:", skipErr.message);
      return { ok: false };
    }
  }
  return { ok: true };
}

/** "Stop these emails": pause every running flow for this flow's buyer. Safe to call again. */
export async function stopBuyer(flowId: string): Promise<{ ok: boolean }> {
  const { data: flow, error: readErr } = await createServiceClient().from("post_purchase_flows").select("store_id, email").eq("id", flowId).maybeSingle();
  if (readErr) {
    console.error("[post-purchase stop] could not read the flow:", readErr.message);
    return { ok: false };
  }
  // Its sequence was deleted: nothing is left to stop.
  if (!flow) return { ok: true };
  return pauseFlowsForBuyer(flow.store_id as string, flow.email as string, "buyer stopped these emails");
}

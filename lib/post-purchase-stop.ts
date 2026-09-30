import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { otoSigningSecret, siteUrl } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * "Stop these emails" on a post-purchase follow-up.
 *
 * The token names one order line and is signed with the same secret as the
 * preview and view-as tokens. It has no expiry: a buyer may open an old email
 * months later, and the link must still work then.
 */
const sign = (body: string) => createHmac("sha256", otoSigningSecret()).update(`pp-stop:${body}`).digest("base64url");

export function stopToken(orderItemId: string): string {
  const body = Buffer.from(orderItemId).toString("base64url");
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

export function stopUrl(orderItemId: string): string {
  return `${siteUrl()}/email/stop?t=${stopToken(orderItemId)}`;
}

/** Stop the rest of this line's sequence. Safe to call again. */
export async function stopSequence(orderItemId: string): Promise<{ ok: boolean; name: string | null }> {
  const db = createServiceClient();
  const updateResult = await db
    .from("order_items")
    .update({ post_purchase_stopped_at: new Date().toISOString() })
    .eq("id", orderItemId)
    .is("post_purchase_stopped_at", null);
  if (updateResult.error) {
    console.error("Failed to stop sequence:", updateResult.error);
    return { ok: false, name: null };
  }
  return { ok: true, name: await stopName(orderItemId) };
}

/** What the line was for, to name it on the stop page. Reads only. */
export async function stopName(orderItemId: string): Promise<string | null> {
  const { data } = await createServiceClient().from("order_items").select("description").eq("id", orderItemId).maybeSingle();
  return (data?.description as string | null) ?? null;
}

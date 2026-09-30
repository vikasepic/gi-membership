import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getSettingsOrDefaults } from "@/lib/settings";
import { sendEmail } from "@/lib/email";
import { recordError, messageOf } from "@/lib/errors";
import { firstNameOf } from "@/lib/post-purchase-email";
import { renderPostPurchaseEmail } from "@/lib/post-purchase-render";
import { delayMs, type DelayUnit, type DocNode } from "@/lib/post-purchase-layout";
import { stopUrl } from "@/lib/post-purchase-stop";

/**
 * Post-purchase sequences: queue at checkout over, send when due.
 * Spec: docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md
 *
 * Only email 1 is queued at the start. Each later email is queued when the one
 * before it is sent, so a sequence edited in between is followed as it stands
 * now, and a stopped one simply never queues the next.
 */

/** Email 1 waits this long, so the welcome email arrives first. */
const FIRST_EMAIL_AFTER_MS = 60_000;
const HOLDS = ["active", "trialing", "past_due"];

type Line = { id: string; kind: string; offer_id: string | null; product_id: string | null };
type Owner = { ownerType: "offer" | "product"; ownerId: string };

function ownerOf(line: Pick<Line, "offer_id" | "product_id">): Owner | null {
  if (line.offer_id) return { ownerType: "offer", ownerId: line.offer_id };
  if (line.product_id) return { ownerType: "product", ownerId: line.product_id };
  return null;
}

export async function queueSequencesForOrder(orderId: string, now = new Date()): Promise<number> {
  const db = createServiceClient();
  const { data: order } = await db.from("orders").select("id, store_id, email, status").eq("id", orderId).maybeSingle();
  if (!order || order.status !== "paid" || !order.email) return 0;
  const { data: lines } = await db.from("order_items").select("id, kind, offer_id, product_id").eq("order_id", orderId).order("created_at");

  let queued = 0;
  for (const line of (lines ?? []) as Line[]) {
    // A renewal is a payment on something bought earlier, not a purchase.
    if (line.kind === "renewal") continue;
    const owner = ownerOf(line);
    if (!owner) continue;
    const { data: seq } = await db
      .from("post_purchase_sequences")
      .select("id, enabled")
      .eq("store_id", order.store_id)
      .eq("owner_type", owner.ownerType)
      .eq("owner_id", owner.ownerId)
      .maybeSingle();
    if (!seq?.enabled) continue;
    const { data: first } = await db
      .from("post_purchase_emails")
      .select("id")
      .eq("sequence_id", seq.id)
      .order("position")
      .limit(1)
      .maybeSingle();
    if (!first) continue;
    const { data: inserted } = await db
      .from("post_purchase_sends")
      .upsert(
        {
          store_id: order.store_id,
          order_item_id: line.id,
          sequence_id: seq.id,
          email_id: first.id,
          position: 1,
          to_email: order.email,
          due_at: new Date(now.getTime() + FIRST_EMAIL_AFTER_MS).toISOString(),
        },
        { onConflict: "order_item_id,sequence_id,position", ignoreDuplicates: true },
      )
      .select("id");
    queued += inserted?.length ?? 0;
  }
  return queued;
}

export type SequenceSendSummary = { sent: number; skipped: number; failed: number };

export async function sendDueSequenceEmails(opts: { now?: Date; limit?: number } = {}): Promise<SequenceSendSummary> {
  const now = opts.now ?? new Date();
  const db = createServiceClient();
  const { data: due } = await db
    .from("post_purchase_sends")
    .select("id")
    .eq("status", "pending")
    .lte("due_at", now.toISOString())
    .order("due_at")
    .order("id")
    .limit(opts.limit ?? 50);
  const out: SequenceSendSummary = { sent: 0, skipped: 0, failed: 0 };
  for (const d of due ?? []) {
    const r = await sendOne(d.id as string, now);
    if (r) out[r] += 1;
  }
  return out;
}

type Claimed = { id: string; order_item_id: string; sequence_id: string; email_id: string | null; position: number; to_email: string; store_id: string };
type EmailRow = { id: string; position: number; subject: string; preheader: string; doc: DocNode };

async function sendOne(sendId: string, now: Date): Promise<keyof SequenceSendSummary | null> {
  const db = createServiceClient();
  // Claim before anything else: two sweeps racing get one send.
  const { data: claimed } = await db
    .from("post_purchase_sends")
    .update({ status: "sending" })
    .eq("id", sendId)
    .eq("status", "pending")
    .select("id, order_item_id, sequence_id, email_id, position, to_email, store_id")
    .maybeSingle();
  if (!claimed) return null;
  const row = claimed as Claimed;

  const skip = async (reason: string) => {
    await db.from("post_purchase_sends").update({ status: "skipped", reason }).eq("id", sendId);
    return "skipped" as const;
  };

  try {
    const { data: line } = await db
      .from("order_items")
      .select("id, description, offer_id, product_id, post_purchase_stopped_at, orders(status, user_id, email)")
      .eq("id", row.order_item_id)
      .maybeSingle();
    const order = line ? ((Array.isArray(line.orders) ? line.orders[0] : line.orders) as { status: string; user_id: string | null; email: string } | null) : null;
    if (!line || !order) return await skip("order line gone");
    if (order.status !== "paid") return await skip("order refunded");
    if (line.post_purchase_stopped_at) return await skip("buyer stopped these emails");

    const { data: seq } = await db.from("post_purchase_sequences").select("enabled, layout").eq("id", row.sequence_id).maybeSingle();
    if (!seq?.enabled) return await skip("sequence switched off");
    if (!order.user_id || !(await stillHolds(order.user_id, line))) return await skip("access ended");

    const sentIds = await sentEmailIds(row);
    const email = await emailToSend(row, sentIds);
    if (!email) return await skip("no email left in the sequence");

    const settings = (await getSettingsOrDefaults()).postPurchaseEmail;
    // By email, the way the welcome finds the name typed at checkout.
    const { data: profile } = await db.from("users").select("username").eq("email", order.email).maybeSingle();
    // Every email after the buyer's first carries the stop link.
    const stop = row.position > 1 ? stopUrl(line.id as string) : null;
    const mail = renderPostPurchaseEmail({
      doc: email.doc,
      subject: email.subject,
      preheader: email.preheader,
      layout: seq.layout,
      vars: {
        first_name: firstNameOf(profile?.username as string | null),
        offer_name: await nameOf(line),
        access_link: settings.accessUrl,
      },
      stopUrl: stop,
    });
    const res = await sendEmail(row.to_email, mail, {
      from: settings.senderName ? `${settings.senderName} <${settings.senderEmail}>` : settings.senderEmail,
      replyTo: settings.replyTo,
      ...(stop ? { headers: { "List-Unsubscribe": `<${stop}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    });
    if (res === "disabled") return await skip("email sending is not configured");
    if (res === "failed") throw new Error("the email provider refused the send");

    await db.from("post_purchase_sends").update({ status: "sent", sent_at: now.toISOString(), email_id: email.id }).eq("id", sendId);
    await queueNext(row, new Set([...sentIds, email.id]), now);
    return "sent";
  } catch (e) {
    await db.from("post_purchase_sends").update({ status: "failed", reason: messageOf(e).slice(0, 500) }).eq("id", sendId);
    await recordError({ source: "post_purchase_sequence", message: messageOf(e), context: { sendId, orderItemId: row.order_item_id } });
    return "failed";
  }
}

async function stillHolds(userId: string, line: { offer_id: string | null; product_id: string | null }): Promise<boolean> {
  const owner = ownerOf(line);
  if (!owner) return false;
  const { data } = await createServiceClient()
    .from("ownership")
    .select("id")
    .eq("user_id", userId)
    .eq(owner.ownerType === "offer" ? "offer_id" : "product_id", owner.ownerId)
    .in("status", HOLDS)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/*
 * The owner may reorder or delete emails while buyers are mid-sequence. One
 * rule covers every case: the next email is the first one, in the sequence's
 * order as it stands now, that this line has not been sent. So nobody gets an
 * email twice and nobody loses one they have not had. A row's `position` is
 * its step (1st, 2nd, 3rd email this line gets), which is what makes queueing
 * the same step twice insert nothing.
 */
async function sentEmailIds(row: Claimed): Promise<Set<string>> {
  const { data } = await createServiceClient()
    .from("post_purchase_sends")
    .select("email_id")
    .eq("order_item_id", row.order_item_id)
    .eq("sequence_id", row.sequence_id)
    .eq("status", "sent");
  return new Set((data ?? []).map((r) => r.email_id as string | null).filter((id): id is string => !!id));
}

async function emailsInOrder(sequenceId: string): Promise<(EmailRow & { delay_amount: number; delay_unit: DelayUnit })[]> {
  const { data } = await createServiceClient()
    .from("post_purchase_emails")
    .select("id, position, subject, preheader, doc, delay_amount, delay_unit")
    .eq("sequence_id", sequenceId)
    .order("position");
  return (data ?? []) as (EmailRow & { delay_amount: number; delay_unit: DelayUnit })[];
}

/** The email this row was queued for, while it exists and is unsent; else the first unsent one. */
async function emailToSend(row: Claimed, sent: Set<string>): Promise<EmailRow | null> {
  const all = await emailsInOrder(row.sequence_id);
  return all.find((e) => e.id === row.email_id && !sent.has(e.id)) ?? all.find((e) => !sent.has(e.id)) ?? null;
}

async function queueNext(row: Claimed, sent: Set<string>, now: Date): Promise<void> {
  const next = (await emailsInOrder(row.sequence_id)).find((e) => !sent.has(e.id));
  if (!next) return;
  await createServiceClient()
    .from("post_purchase_sends")
    .upsert(
      {
        store_id: row.store_id,
        order_item_id: row.order_item_id,
        sequence_id: row.sequence_id,
        email_id: next.id,
        position: row.position + 1,
        to_email: row.to_email,
        due_at: new Date(now.getTime() + delayMs(next.delay_amount, next.delay_unit)).toISOString(),
      },
      { onConflict: "order_item_id,sequence_id,position", ignoreDuplicates: true },
    );
}

async function nameOf(line: { description?: string | null; offer_id: string | null; product_id: string | null }): Promise<string> {
  const db = createServiceClient();
  if (line.offer_id) {
    const { data } = await db.from("offers").select("name").eq("id", line.offer_id).maybeSingle();
    if (data?.name) return data.name as string;
  }
  if (line.product_id) {
    const { data } = await db.from("products").select("title").eq("id", line.product_id).maybeSingle();
    if (data?.title) return data.title as string;
  }
  return line.description ?? "your purchase";
}

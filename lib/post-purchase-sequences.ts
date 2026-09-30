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
 * Post-purchase flows: started or resumed when a checkout is over, their
 * emails sent when due.
 * Spec: docs/superpowers/specs/2026-09-30-post-purchase-sequences-design.md
 * (Part 2 is the flow model and its rules table).
 *
 * A flow is one buyer (order email, lower-cased) on one sequence: the store
 * series, or one offer's or product's. It is running, paused (the buyer
 * clicked stop, which pauses all their flows) or done. Only the next email is
 * ever queued; each later one is queued when the one before it is sent, so a
 * sequence edited in between is followed as it stands now.
 */

/** An item's email 1 waits this long, so the welcome email arrives first. Nothing is ever queued sooner. */
const FIRST_EMAIL_AFTER_MS = 60_000;
/**
 * How far a row reverted to pending (an error before delivery) is pushed out.
 * The sweep takes the oldest-due 50 rows; a row stuck on a permanent failure
 * that kept its due time would retry every sweep and crowd out the rows
 * behind it.
 */
const RETRY_AFTER_MS = 30 * 60_000;
const HOLDS = ["active", "trialing", "past_due"];

type OwnerType = "store" | "offer" | "product";
type Line = { id: string; kind: string; offer_id: string | null; product_id: string | null };
type Order = { id: string; store_id: string; email: string | null; status: string; created_at: string };
type Flow = { id: string; store_id: string; sequence_id: string; email: string; status: "running" | "paused" | "done"; run: number; order_id: string | null; updated_at: string };
type Sequence = { id: string; enabled: boolean; layout: unknown; owner_type: OwnerType; owner_id: string };
type EmailRow = { id: string; position: number; subject: string; preheader: string; doc: DocNode; delay_amount: number; delay_unit: DelayUnit };
/** What a queued step needs to know about its flow. A claimed send row carries the same fields. */
type StepTarget = { store_id: string; flow_id: string; sequence_id: string; to_email: string };

const FLOW_COLUMNS = "id, store_id, sequence_id, email, status, run, order_id, updated_at";
const SEQUENCE_COLUMNS = "id, enabled, layout, owner_type, owner_id";

/** A buyer is their order email, trimmed and lower-cased. */
export const buyerKey = (email: string) => email.trim().toLowerCase();

const targetOf = (f: Flow): StepTarget => ({ store_id: f.store_id, flow_id: f.id, sequence_id: f.sequence_id, to_email: f.email });

function ownerOf(line: Pick<Line, "offer_id" | "product_id">): { ownerType: "offer" | "product"; ownerId: string } | null {
  if (line.offer_id) return { ownerType: "offer", ownerId: line.offer_id };
  if (line.product_id) return { ownerType: "product", ownerId: line.product_id };
  return null;
}

/**
 * supabase-js reports a network or 5xx failure as `{ error }`, not a thrown
 * exception, so every read and write in this file is unwrapped through here.
 * A transient failure must become a visible error, never a silently empty
 * result that reads as "nothing to do".
 */
async function unwrap<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

/**
 * Apply the rules table to one purchase. Called when the checkout is over
 * (lib/post-purchase-send.ts) and by the re-queue sweep; both may call it for
 * the same order, so every step is safe to run twice. Only lines not yet
 * processed count, and each is stamped once processed: a line written after
 * the checkout step ran (the webhook race, a late bump or upsell) is picked up
 * on a later call.
 */
export async function startFlowsForOrder(orderId: string, now = new Date()): Promise<number> {
  const db = createServiceClient();
  const order = (await unwrap(
    db.from("orders").select("id, store_id, email, status, created_at").eq("id", orderId).maybeSingle(),
    "startFlowsForOrder: orders",
  )) as Order | null;
  if (!order || order.status !== "paid") return 0;
  const lines = ((await unwrap(
    db.from("order_items").select("id, kind, offer_id, product_id").eq("order_id", orderId).is("post_purchase_flows_at", null).order("created_at"),
    "startFlowsForOrder: order_items",
  )) ?? []) as Line[];
  // A renewal is a payment on something bought earlier, not a purchase.
  const fresh = lines.filter((l) => l.kind !== "renewal");
  if (fresh.length === 0) return 0;

  let queued = 0;
  if (order.email) {
    const email = buyerKey(order.email);
    // Buying again removes a stop: every flow the buyer paused picks up where it stopped.
    queued += await resumePausedFlows(order, email, now);
    const store = await enabledSequence(order.store_id, "store", order.store_id);
    if (store) queued += await startFlow(order, email, store, now);
    for (const line of fresh) {
      const owner = ownerOf(line);
      if (!owner) continue;
      const seq = await enabledSequence(order.store_id, owner.ownerType, owner.ownerId);
      if (seq) queued += await startFlow(order, email, seq, now);
    }
  }
  // Processed: the re-queue sweep never takes these lines again.
  await unwrap(
    db.from("order_items").update({ post_purchase_flows_at: now.toISOString() }).in("id", fresh.map((l) => l.id)).is("post_purchase_flows_at", null),
    "startFlowsForOrder: stamp lines",
  );
  return queued;
}

async function resumePausedFlows(order: Order, email: string, now: Date): Promise<number> {
  const db = createServiceClient();
  const paused = ((await unwrap(
    db.from("post_purchase_flows").select(FLOW_COLUMNS).eq("store_id", order.store_id).eq("email", email).eq("status", "paused").order("created_at"),
    "resumePausedFlows: flows",
  )) ?? []) as Flow[];
  let queued = 0;
  for (const f of paused) {
    // Only a purchase made after the stop removes it. A flow paused after this
    // order was placed (its late line processed now) stays paused.
    if (f.order_id === order.id || new Date(f.updated_at) > new Date(order.created_at)) continue;
    // A sequence switched off stays paused: it has nothing to send.
    if (!(await sequenceById(f.sequence_id))?.enabled) continue;
    const flipped = (await unwrap(
      db.from("post_purchase_flows")
        .update({ status: "running", order_id: order.id, updated_at: now.toISOString() })
        .eq("id", f.id).eq("status", "paused")
        .select(FLOW_COLUMNS),
      "resumePausedFlows: resume",
    )) as Flow[] | null;
    const flow = flipped?.[0];
    if (!flow) continue;
    const sent = await sentEmailIds(flow.id, flow.run);
    const next = (await emailsInOrder(flow.sequence_id)).find((e) => !sent.has(e.id));
    if (!next) {
      await markDone(flow.id, flow.run);
      continue;
    }
    // Anything still queued from before the stop (one that landed mid-send) is
    // replaced, so the run never holds two queued emails.
    await unwrap(
      db.from("post_purchase_sends").update({ status: "skipped", reason: "replaced on resume" }).eq("flow_id", flow.id).eq("run", flow.run).eq("status", "pending"),
      "resumePausedFlows: clear queued",
    );
    // Its own delay, counted from this purchase, and never ahead of this purchase's welcome.
    const wait = Math.max(delayMs(next.delay_amount, next.delay_unit), FIRST_EMAIL_AFTER_MS);
    queued += await queueStep(targetOf(flow), flow.run, (await lastPosition(flow.id, flow.run)) + 1, next.id, new Date(now.getTime() + wait));
  }
  return queued;
}

/** Start, restart or leave alone this buyer's flow on one sequence, per the rules table. */
async function startFlow(order: Order, email: string, seq: Sequence, now: Date): Promise<number> {
  const db = createServiceClient();
  const existing = (await unwrap(
    db.from("post_purchase_flows").select(FLOW_COLUMNS).eq("sequence_id", seq.id).eq("email", email).maybeSingle(),
    "startFlow: flows",
  )) as Flow | null;

  if (!existing) {
    const created = (await unwrap(
      db.from("post_purchase_flows")
        .upsert(
          { store_id: order.store_id, sequence_id: seq.id, email, status: "running", run: 1, order_id: order.id },
          { onConflict: "sequence_id,email", ignoreDuplicates: true },
        )
        .select(FLOW_COLUMNS),
      "startFlow: create flow",
    )) as Flow[] | null;
    const flow = created?.[0];
    // No row back: another request created it a moment ago.
    return flow ? queueFirst(flow, seq, now) : 0;
  }
  // Already handled for this purchase.
  if (existing.order_id === order.id) return 0;
  // Running carries on, with no second copy. Paused was resumed above.
  if (existing.status !== "done") return 0;
  // A finished store series stays finished.
  if (seq.owner_type === "store") return 0;
  // A finished item flow starts again from email 1, as a new run.
  const restarted = (await unwrap(
    db.from("post_purchase_flows")
      .update({ status: "running", run: existing.run + 1, order_id: order.id, updated_at: now.toISOString() })
      .eq("id", existing.id).eq("status", "done").eq("run", existing.run)
      .select(FLOW_COLUMNS),
    "startFlow: restart flow",
  )) as Flow[] | null;
  const flow = restarted?.[0];
  return flow ? queueFirst(flow, seq, now) : 0;
}

async function queueFirst(flow: Flow, seq: Sequence, now: Date): Promise<number> {
  const first = (await emailsInOrder(seq.id))[0];
  if (!first) {
    await markDone(flow.id, flow.run);
    return 0;
  }
  // Every store email follows the welcome, so even the first waits its delay; an item's email 1 goes a minute after checkout.
  const wait = seq.owner_type === "store" ? Math.max(delayMs(first.delay_amount, first.delay_unit), FIRST_EMAIL_AFTER_MS) : FIRST_EMAIL_AFTER_MS;
  return queueStep(targetOf(flow), flow.run, 1, first.id, new Date(now.getTime() + wait));
}

async function queueStep(t: StepTarget, run: number, position: number, emailId: string, dueAt: Date): Promise<number> {
  const inserted = await unwrap(
    createServiceClient()
      .from("post_purchase_sends")
      .upsert(
        { store_id: t.store_id, flow_id: t.flow_id, run, sequence_id: t.sequence_id, email_id: emailId, position, to_email: t.to_email, due_at: dueAt.toISOString() },
        { onConflict: "flow_id,run,position", ignoreDuplicates: true },
      )
      .select("id"),
    "queueStep: post_purchase_sends",
  );
  return (inserted as unknown[] | null)?.length ?? 0;
}

async function enabledSequence(storeId: string, ownerType: OwnerType, ownerId: string): Promise<Sequence | null> {
  const seq = (await unwrap(
    createServiceClient().from("post_purchase_sequences").select(SEQUENCE_COLUMNS).eq("store_id", storeId).eq("owner_type", ownerType).eq("owner_id", ownerId).maybeSingle(),
    "enabledSequence",
  )) as Sequence | null;
  return seq?.enabled ? seq : null;
}

async function sequenceById(id: string): Promise<Sequence | null> {
  return (await unwrap(
    createServiceClient().from("post_purchase_sequences").select(SEQUENCE_COLUMNS).eq("id", id).maybeSingle(),
    "sequenceById",
  )) as Sequence | null;
}

async function lastPosition(flowId: string, run: number): Promise<number> {
  const row = (await unwrap(
    createServiceClient().from("post_purchase_sends").select("position").eq("flow_id", flowId).eq("run", run).order("position", { ascending: false }).limit(1).maybeSingle(),
    "lastPosition",
  )) as { position: number } | null;
  return row?.position ?? 0;
}

async function markDone(flowId: string, run: number): Promise<void> {
  await unwrap(
    createServiceClient().from("post_purchase_flows").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", flowId).eq("run", run).eq("status", "running"),
    "markDone",
  );
}

/**
 * The safety net under the checkout-over step. completeOfferCheckout
 * (lib/offer-checkout.ts) marks an order paid before its lines are written,
 * a bump or upsell line can arrive after the host line, and a transient
 * failure can stop processing part-way: purchase lines not yet stamped with
 * post_purchase_flows_at are processed here.
 *
 * Only orders the welcome can no longer come before: post_purchase_sent_at
 * set, or the welcome switched off. With the welcome on and still to come, the
 * welcome path processes the order first. The owner chose "right after the welcome".
 * ponytail: lines of orders from the last 2 hours only, 100 per run; fine at
 * this store's volume.
 */
export async function requeueMissedSequences(now = new Date()): Promise<number> {
  const db = createServiceClient();
  const welcomeOn = (await getSettingsOrDefaults()).postPurchaseEmail.enabled;
  let query = db
    .from("order_items")
    .select("order_id, orders!inner(status, created_at, post_purchase_sent_at)")
    .is("post_purchase_flows_at", null)
    .neq("kind", "renewal")
    .eq("orders.status", "paid")
    .gte("orders.created_at", new Date(now.getTime() - 2 * 3_600_000).toISOString())
    .lte("orders.created_at", new Date(now.getTime() - 5 * 60_000).toISOString());
  if (welcomeOn) query = query.not("orders.post_purchase_sent_at", "is", null);
  const lines = (await unwrap(query.order("created_at").limit(100), "requeueMissedSequences: order_items")) as { order_id: string }[] | null;
  let queued = 0;
  for (const orderId of [...new Set((lines ?? []).map((l) => l.order_id))]) {
    try {
      // Still deciding on an upsell, so the checkout is not over: the same test sendPostPurchaseIfDue makes.
      const pending = await unwrap(
        db.from("oto_tokens").select("id").eq("order_id", orderId).eq("status", "pending").gt("expires_at", now.toISOString()).limit(1),
        "requeueMissedSequences: oto_tokens",
      );
      if (pending?.length) continue;
      queued += await startFlowsForOrder(orderId, now);
    } catch (e) {
      await recordError({ source: "post_purchase_sequence", message: `could not queue post-purchase emails: ${messageOf(e)}`, context: { orderId } });
    }
  }
  return queued;
}

export type SequenceSendSummary = { sent: number; skipped: number; failed: number };

export async function sendDueSequenceEmails(opts: { now?: Date; limit?: number } = {}): Promise<SequenceSendSummary> {
  const now = opts.now ?? new Date();
  const due = await unwrap(
    createServiceClient()
      .from("post_purchase_sends")
      .select("id")
      .eq("status", "pending")
      .lte("due_at", now.toISOString())
      .order("due_at")
      .order("id")
      .limit(opts.limit ?? 50),
    "sendDueSequenceEmails: post_purchase_sends",
  );
  const out: SequenceSendSummary = { sent: 0, skipped: 0, failed: 0 };
  for (const d of due ?? []) {
    const r = await sendOne(d.id as string, now);
    if (r) out[r] += 1;
  }
  return out;
}

type Claimed = StepTarget & { id: string; run: number; email_id: string | null; position: number };

/** The provider itself said no. Kept distinct from every other failure: this one still ends the chain and marks the row failed. */
class SendRefused extends Error {}

async function sendOne(sendId: string, now: Date): Promise<keyof SequenceSendSummary | null> {
  const db = createServiceClient();
  // Claim before anything else: two sweeps racing get one send. No row back
  // means someone else has it; an error on the claim means nothing was
  // claimed, so there is nothing to undo.
  const { data: claimed, error: claimError } = await db
    .from("post_purchase_sends")
    .update({ status: "sending" })
    .eq("id", sendId)
    .eq("status", "pending")
    .select("id, flow_id, run, sequence_id, email_id, position, to_email, store_id")
    .maybeSingle();
  if (claimError) {
    console.error(`[post_purchase_sequence] could not claim send ${sendId}: ${claimError.message}`);
    return null;
  }
  if (!claimed) return null;
  const row = claimed as Claimed;
  // Set the moment sendEmail reports "sent". After that, never retry the send itself.
  let delivered = false;

  const skip = async (reason: string) => {
    await unwrap(db.from("post_purchase_sends").update({ status: "skipped", reason }).eq("id", sendId), "sendOne: mark skipped");
    return "skipped" as const;
  };
  // A stop rule ends the flow too, so a later purchase of the item starts it again.
  const end = async (reason: string) => {
    await skip(reason);
    await markDone(row.flow_id, row.run);
    return "skipped" as const;
  };

  try {
    const flow = (await unwrap(db.from("post_purchase_flows").select(FLOW_COLUMNS).eq("id", row.flow_id).maybeSingle(), "sendOne: flow")) as Flow | null;
    if (!flow) return await skip("flow gone");
    if (flow.run !== row.run) return await skip("flow started again");
    if (flow.status === "paused") return await skip("buyer stopped these emails");
    if (flow.status === "done") return await skip("flow finished");

    const seq = await sequenceById(row.sequence_id);
    if (!seq?.enabled) return await end("sequence switched off");

    const order = flow.order_id
      ? ((await unwrap(db.from("orders").select("id, status, user_id, email").eq("id", flow.order_id).maybeSingle(), "sendOne: order")) as
          | { id: string; status: string; user_id: string | null; email: string }
          | null)
      : null;
    if (seq.owner_type === "store") {
      if (!(await hasPaidOrder(flow))) return await end("every order refunded");
    } else {
      if (!order || order.status !== "paid") return await end("order refunded");
      if (!order.user_id || !(await stillHolds(order.user_id, seq))) return await end("access ended");
    }

    const sent = await sentEmailIds(row.flow_id, row.run, row.id);
    const email = await emailToSend(row, sent);
    if (!email) return await end("no email left in the sequence");

    const settings = (await getSettingsOrDefaults()).postPurchaseEmail;
    // By email, the way the welcome finds the name typed at checkout.
    const profile = await unwrap(db.from("users").select("username").eq("email", order?.email ?? flow.email).limit(1).maybeSingle(), "sendOne: users");
    // Every store email follows the welcome and can be stopped; an item's first email of a run is not.
    const stop = seq.owner_type === "store" || sent.size > 0 ? stopUrl(flow.id) : null;
    const mail = renderPostPurchaseEmail({
      doc: email.doc,
      subject: email.subject,
      preheader: email.preheader,
      layout: seq.layout,
      vars: {
        first_name: firstNameOf(profile?.username as string | null),
        offer_name: await whatTheyBought(seq, flow.order_id),
        access_link: settings.accessUrl,
      },
      stopUrl: stop,
    });
    const res = await sendEmail(row.to_email, mail, {
      from: settings.senderName ? `${settings.senderName} <${settings.senderEmail}>` : settings.senderEmail,
      replyTo: settings.replyTo,
      ...(stop ? { headers: { "List-Unsubscribe": `<${stop}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
    });
    // Not set up yet is not a no: retried later like any other failure before delivery.
    if (res === "disabled") throw new Error("email sending is not configured");
    if (res === "failed") throw new SendRefused("the email provider refused the send");
    delivered = true;

    await unwrap(db.from("post_purchase_sends").update({ status: "sent", sent_at: now.toISOString(), email_id: email.id }).eq("id", sendId), "sendOne: mark sent");
    await queueNext(row, new Set([...sent, email.id]), now);
    return "sent";
  } catch (e) {
    const context = { sendId, flowId: row.flow_id };
    if (e instanceof SendRefused) {
      await db.from("post_purchase_sends").update({ status: "failed", reason: messageOf(e).slice(0, 500) }).eq("id", sendId);
      await recordError({ source: "post_purchase_sequence", message: messageOf(e), context });
      // The chain ends here, so the flow is done: buying the item again starts it over.
      await markDone(row.flow_id, row.run).catch(() => {});
      return "failed";
    }
    if (!delivered) {
      // Nothing went out: put the claim back, half an hour out, so a later sweep retries it.
      await db
        .from("post_purchase_sends")
        .update({ status: "pending", due_at: new Date(now.getTime() + RETRY_AFTER_MS).toISOString() })
        .eq("id", sendId)
        .eq("status", "sending");
      await recordError({ source: "post_purchase_sequence", message: messageOf(e), context });
      return null;
    }
    // The buyer already has the email. A retry would send it twice, so the row
    // is left as it is and this only surfaces on the Errors page.
    await recordError({ source: "post_purchase_sequence", message: `email sent but the chain could not continue: ${messageOf(e)}`, context });
    await markDone(row.flow_id, row.run).catch(() => {});
    return "sent";
  }
}

/**
 * Any order of this buyer still paid. Matched without case, like buyerKey;
 * LIKE's wildcards in the address are escaped, so "a_b@x" never matches "axb@x".
 */
async function hasPaidOrder(flow: Flow): Promise<boolean> {
  const data = await unwrap(
    createServiceClient()
      .from("orders")
      .select("id")
      .eq("store_id", flow.store_id)
      .eq("status", "paid")
      .ilike("email", flow.email.replace(/[\\%_]/g, (c) => `\\${c}`))
      .limit(1),
    "hasPaidOrder: orders",
  );
  return ((data as unknown[] | null)?.length ?? 0) > 0;
}

async function stillHolds(userId: string, seq: Sequence): Promise<boolean> {
  const data = await unwrap(
    createServiceClient()
      .from("ownership")
      .select("id")
      .eq("user_id", userId)
      .eq(seq.owner_type === "offer" ? "offer_id" : "product_id", seq.owner_id)
      .in("status", HOLDS)
      .limit(1),
    "stillHolds: ownership",
  );
  return ((data as unknown[] | null)?.length ?? 0) > 0;
}

/*
 * The owner may reorder or delete emails while buyers are part-way through.
 * One rule covers every case: the next email is the first one, in the
 * sequence's current order, not yet sent in this run.
 */
async function sentEmailIds(flowId: string, run: number, exceptSendId?: string): Promise<Set<string>> {
  // A row still 'sending' may have gone out before its process died: counted
  // as sent, so it is never sent again. The row being sent right now is not.
  let query = createServiceClient().from("post_purchase_sends").select("email_id").eq("flow_id", flowId).eq("run", run).in("status", ["sent", "sending"]);
  if (exceptSendId) query = query.neq("id", exceptSendId);
  const data = await unwrap(query, "sentEmailIds");
  return new Set(((data ?? []) as { email_id: string | null }[]).map((r) => r.email_id).filter((id): id is string => !!id));
}

async function emailsInOrder(sequenceId: string): Promise<EmailRow[]> {
  const data = await unwrap(
    createServiceClient().from("post_purchase_emails").select("id, position, subject, preheader, doc, delay_amount, delay_unit").eq("sequence_id", sequenceId).order("position"),
    "emailsInOrder",
  );
  return (data ?? []) as EmailRow[];
}

/** The email this row was queued for, while it exists and is unsent in this run; else the first unsent one. */
async function emailToSend(row: Claimed, sent: Set<string>): Promise<EmailRow | null> {
  const all = await emailsInOrder(row.sequence_id);
  return all.find((e) => e.id === row.email_id && !sent.has(e.id)) ?? all.find((e) => !sent.has(e.id)) ?? null;
}

async function queueNext(row: Claimed, sent: Set<string>, now: Date): Promise<void> {
  const next = (await emailsInOrder(row.sequence_id)).find((e) => !sent.has(e.id));
  if (!next) {
    await markDone(row.flow_id, row.run);
    return;
  }
  await queueStep(row, row.run, row.position + 1, next.id, new Date(now.getTime() + delayMs(next.delay_amount, next.delay_unit)));
}

/** "What they bought": the item for an item flow; for the store series, the first item of the purchase that started or resumed it. */
async function whatTheyBought(seq: Sequence, orderId: string | null): Promise<string> {
  const db = createServiceClient();
  if (seq.owner_type === "offer") {
    const data = (await unwrap(db.from("offers").select("name").eq("id", seq.owner_id).maybeSingle(), "whatTheyBought: offers")) as { name: string } | null;
    if (data?.name) return data.name;
  }
  if (seq.owner_type === "product") {
    const data = (await unwrap(db.from("products").select("title").eq("id", seq.owner_id).maybeSingle(), "whatTheyBought: products")) as { title: string } | null;
    if (data?.title) return data.title;
  }
  if (seq.owner_type === "store" && orderId) {
    const data = (await unwrap(
      db.from("order_items").select("description").eq("order_id", orderId).order("created_at").limit(1).maybeSingle(),
      "whatTheyBought: order_items",
    )) as { description: string | null } | null;
    if (data?.description) return data.description;
  }
  return "your purchase";
}

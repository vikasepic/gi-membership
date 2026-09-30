import "server-only";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getStoreId } from "@/lib/store";
import {
  layoutSchema, parseLayout, docSchema, DELAY_UNITS, docUrls, urlProblem,
  type DocNode, type EmailLayout, type DelayUnit,
} from "@/lib/post-purchase-layout";

export type OwnerType = "store" | "offer" | "product";
export type SequenceEmail = { id: string | null; delayAmount: number; delayUnit: DelayUnit; subject: string; preheader: string; doc: DocNode };
export type Sequence = { id: string | null; enabled: boolean; layout: EmailLayout; replyTo?: string; emails: SequenceEmail[] };

const emailInputSchema = z.object({
  id: z.uuid().nullable(),
  delayAmount: z.number().int().min(0).max(365),
  delayUnit: z.enum(DELAY_UNITS),
  subject: z.string().trim().max(200),
  preheader: z.string().trim().max(200),
  doc: docSchema,
});
export const saveInputSchema = z.object({
  ownerType: z.enum(["store", "offer", "product"]),
  ownerId: z.uuid(),
  enabled: z.boolean(),
  layout: layoutSchema,
  /** Where replies go; empty or missing means the store's own reply-to. */
  replyTo: z.union([z.literal(""), z.email()]).optional(),
  emails: z.array(emailInputSchema).max(20),
});
export type SaveInput = z.infer<typeof saveInputSchema>;

/** Why this cannot be saved, naming the email; null when it can. */
export function saveProblem(input: SaveInput): string | null {
  if (input.enabled && input.emails.length === 0) return "Add at least one email before turning this on.";
  for (const [i, e] of input.emails.entries()) {
    const n = i + 1;
    if (input.enabled && !e.subject.trim()) return `Email ${n} needs a subject line.`;
    // An item's email 1 goes right after the welcome; every store email follows it.
    if ((input.ownerType === "store" || i > 0) && e.delayAmount < 1) return `Email ${n} needs a delay of at least 1 ${e.delayUnit === "hours" ? "hour" : "day"}.`;
    if (JSON.stringify(e.doc).length > 200_000) return `Email ${n} is too large. Upload images with the image button rather than pasting them.`;
    for (const u of docUrls(e.doc)) {
      const p = urlProblem(u);
      if (p) return `Email ${n}: ${p}.`;
    }
  }
  return null;
}

/**
 * Throws on a failed read: shown as off and empty, the sequence could be
 * turned on and saved straight over the real one.
 */
export async function getSequence(ownerType: OwnerType, ownerId: string): Promise<Sequence> {
  const db = createServiceClient();
  const { data: seq, error: seqErr } = await db
    .from("post_purchase_sequences")
    .select("id, enabled, layout, reply_to")
    .eq("store_id", await getStoreId())
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (seqErr) throw new Error(`getSequence: post_purchase_sequences: ${seqErr.message}`);
  if (!seq) return { id: null, enabled: false, layout: parseLayout({}), replyTo: "", emails: [] };
  const { data: rows, error: rowsErr } = await db
    .from("post_purchase_emails")
    .select("id, position, delay_amount, delay_unit, subject, preheader, doc")
    .eq("sequence_id", seq.id)
    .order("position");
  if (rowsErr) throw new Error(`getSequence: post_purchase_emails: ${rowsErr.message}`);
  return {
    id: seq.id as string,
    enabled: Boolean(seq.enabled),
    layout: parseLayout(seq.layout),
    replyTo: (seq.reply_to as string | null) ?? "",
    emails: (rows ?? []).map((r) => ({
      id: r.id as string,
      delayAmount: r.delay_amount as number,
      delayUnit: r.delay_unit as DelayUnit,
      subject: r.subject as string,
      preheader: r.preheader as string,
      doc: r.doc as DocNode,
    })),
  };
}

/**
 * Save the whole sequence in the order given.
 *
 * Each email keeps its id across saves, because a buyer's pending send points
 * at the email it is waiting for: a reorder then sends the right one, and a
 * deleted email's pending sends fall through to the next one that exists
 * (lib/post-purchase-sequences.ts).
 */
export async function saveSequence(
  input: SaveInput,
): Promise<{ ok: true; emailIds: string[] } | { ok: false; error: string }> {
  const problem = saveProblem(input);
  if (problem) return { ok: false, error: problem };
  const db = createServiceClient();
  const now = new Date().toISOString();

  const { data: seq, error: seqErr } = await db
    .from("post_purchase_sequences")
    .upsert(
      { store_id: await getStoreId(), owner_type: input.ownerType, owner_id: input.ownerId, enabled: input.enabled, layout: input.layout, reply_to: input.replyTo ?? "", updated_at: now },
      { onConflict: "store_id,owner_type,owner_id" },
    )
    .select("id")
    .single();
  if (seqErr || !seq) return { ok: false, error: `Could not save: ${seqErr?.message ?? "no sequence row"}` };

  // Unread, every email would get a new id, the delete below would remove the
  // real rows, and buyers part-way through would be sent email 1 again.
  const { data: existing, error: readErr } = await db.from("post_purchase_emails").select("id").eq("sequence_id", seq.id);
  if (readErr) return { ok: false, error: `Could not save: ${readErr.message}` };
  const mine = new Set((existing ?? []).map((r) => r.id as string));
  // An id this sequence does not own is a new email, never a stolen one.
  const rows = input.emails.map((e, i) => ({
    id: e.id && mine.has(e.id) ? e.id : crypto.randomUUID(),
    sequence_id: seq.id as string,
    position: i + 1,
    delay_amount: i === 0 && input.ownerType !== "store" ? 0 : e.delayAmount,
    delay_unit: e.delayUnit,
    subject: e.subject.trim(),
    preheader: e.preheader.trim(),
    doc: e.doc,
    updated_at: now,
  }));

  const keep = rows.map((r) => r.id);
  let del = db.from("post_purchase_emails").delete().eq("sequence_id", seq.id);
  if (keep.length) del = del.not("id", "in", `(${keep.join(",")})`);
  const { error: delErr } = await del;
  if (delErr) return { ok: false, error: `Could not save: ${delErr.message}` };

  if (rows.length) {
    const { error: upErr } = await db.from("post_purchase_emails").upsert(rows, { onConflict: "id" });
    if (upErr) return { ok: false, error: `Could not save: ${upErr.message}` };
  }
  return { ok: true, emailIds: keep };
}

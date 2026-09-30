import { describe, it, expect, afterAll, beforeEach, vi } from "vitest";

const sent: { to: string; subject: string; headers?: Record<string, string> }[] = [];
let nextResult: "sent" | "failed" | "disabled" = "sent";
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendEmail: async (to: string, mail: { subject: string }, over?: { headers?: Record<string, string> }) => {
    if (nextResult === "sent") sent.push({ to, subject: mail.subject, headers: over?.headers });
    return nextResult;
  },
}));
// Pinned rather than read from the local store, where an admin may have
// switched the welcome on: the wiring test below needs it off.
vi.mock("@/lib/settings", () => ({
  getSettingsOrDefaults: async () => ({
    postPurchaseEmail: { enabled: false, accessUrl: "https://grow.greaterinside.com/login", senderName: "Ajit", senderEmail: "ajit@example.com", replyTo: "" },
  }),
}));

const { createServiceClient } = await import("@/lib/supabase/server");
const { getStoreId } = await import("@/lib/store");
const { saveSequence, getSequence } = await import("@/lib/post-purchase-store");
const { queueSequencesForOrder, sendDueSequenceEmails } = await import("@/lib/post-purchase-sequences");
const { LAYOUT_DEFAULTS, starterDoc } = await import("@/lib/post-purchase-layout");

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const users: string[] = [];
const offers: string[] = [];
const DAY = 86_400_000;

beforeEach(() => {
  sent.length = 0;
  nextResult = "sent";
});

describe.skipIf(!canRun)("post-purchase sequences (integration)", () => {
  /** An offer, a paying buyer who owns it, and one order line for it. */
  async function purchase(opts: { kind?: string; subjects?: string[]; enabled?: boolean } = {}) {
    const db = createServiceClient();
    const storeId = await getStoreId();
    const offerId = crypto.randomUUID();
    offers.push(offerId);
    const off = await db.from("offers").insert({
      id: offerId, store_id: storeId, key: `zz-pps-${offerId}`, name: "zz Funnel App", grant_type: "subscription",
      grant_app_id: APP, grant_entitlement_key: `zz-pps-${offerId}`, grant_channels: [], billing_type: "one_time",
      price_cents: 2900, currency: "usd", headline: "fixture", description: "fixture",
    });
    if (off.error) throw new Error(`fixture offer: ${off.error.message}`);
    const email = `zzpps_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const created = await db.auth.admin.createUser({ email, password: "password12345", email_confirm: true });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    users.push(userId);
    await db.from("users").insert({ id: userId, store_id: storeId, email, username: "Priya Shah" });
    const { data: order } = await db.from("orders").insert({ store_id: storeId, user_id: userId, email, status: "paid", total_cents: 2900, subtotal_cents: 2900, currency: "usd" }).select("id").single();
    const { data: item } = await db.from("order_items").insert({ store_id: storeId, order_id: order!.id, kind: opts.kind ?? "oto", description: "zz Funnel App", amount_cents: 2900, offer_id: offerId }).select("id").single();
    const own = await db.from("ownership").insert({ store_id: storeId, user_id: userId, app_id: APP, offer_id: offerId, status: "active", source: "purchase" });
    if (own.error) throw new Error(`fixture ownership: ${own.error.message}`);
    const subjects = opts.subjects ?? ["One", "Two", "Three"];
    await saveSequence({
      ownerType: "offer", ownerId: offerId, enabled: opts.enabled ?? true, layout: LAYOUT_DEFAULTS,
      emails: subjects.map((s) => ({ id: null, delayAmount: 2, delayUnit: "days" as const, subject: s, preheader: "", doc: starterDoc("Funnel App") })),
    });
    return { orderId: order!.id as string, itemId: item!.id as string, userId, offerId, email };
  }

  async function sends(itemId: string) {
    const { data } = await createServiceClient()
      .from("post_purchase_sends")
      .select("position, status, reason, due_at, sent_at")
      .eq("order_item_id", itemId)
      .order("position");
    return (data ?? []) as { position: number; status: string; reason: string | null; due_at: string; sent_at: string | null }[];
  }

  it("queues email 1 a minute out, once, however often it is asked", async () => {
    const p = await purchase();
    const now = new Date();
    expect(await queueSequencesForOrder(p.orderId, now)).toBe(1);
    expect(await queueSequencesForOrder(p.orderId, now)).toBe(0);
    const [row] = await sends(p.itemId);
    expect(row.position).toBe(1);
    expect(new Date(row.due_at).getTime()).toBe(now.getTime() + 60_000);
  });

  it("queues nothing for a renewal line or a sequence that is off", async () => {
    const renewal = await purchase({ kind: "renewal" });
    expect(await queueSequencesForOrder(renewal.orderId)).toBe(0);
    const off = await purchase({ enabled: false });
    expect(await queueSequencesForOrder(off.orderId)).toBe(0);
  });

  it("sends email 1 once, then queues email 2 its delay later", async () => {
    const p = await purchase();
    const t0 = new Date();
    await queueSequencesForOrder(p.orderId, t0);
    const at = new Date(t0.getTime() + 61_000);
    // Two sweeps at once: the claim lets only one of them send.
    await Promise.all([sendDueSequenceEmails({ now: at }), sendDueSequenceEmails({ now: at })]);
    // Every sweep also sees other tests' rows in the shared store, so each
    // assertion looks only at this buyer's mail.
    const mine = sent.filter((s) => s.to === p.email);
    expect(mine.map((s) => s.subject)).toEqual(["One"]);
    const rows = await sends(p.itemId);
    expect(rows.map((r) => [r.position, r.status])).toEqual([[1, "sent"], [2, "pending"]]);
    expect(new Date(rows[1].due_at).getTime()).toBe(at.getTime() + 2 * DAY);
    // Email 1 has no stop link; email 2 will.
    expect(mine[0].headers).toBeUndefined();
  });

  it("follow-ups carry List-Unsubscribe", async () => {
    const p = await purchase();
    const t0 = new Date();
    await queueSequencesForOrder(p.orderId, t0);
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * DAY) });
    const two = sent.find((s) => s.to === p.email && s.subject === "Two");
    // http in this test env: NEXT_PUBLIC_SITE_URL is pinned to
    // http://localhost:3000 in vitest.setup.ts and in CI, so stopUrl() (Task 5)
    // never returns https here. Production still gets https from the real env var.
    expect(two?.headers?.["List-Unsubscribe"]).toMatch(/^<https?:\/\/.+\/email\/stop\?t=.+>$/);
    expect(two?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it.each([
    ["order refunded", async (p: Awaited<ReturnType<typeof purchase>>) => { await createServiceClient().from("orders").update({ status: "refunded" }).eq("id", p.orderId); }],
    ["access ended", async (p: Awaited<ReturnType<typeof purchase>>) => { await createServiceClient().from("ownership").update({ status: "canceled" }).eq("user_id", p.userId); }],
    ["buyer stopped these emails", async (p: Awaited<ReturnType<typeof purchase>>) => { await createServiceClient().from("order_items").update({ post_purchase_stopped_at: new Date().toISOString() }).eq("id", p.itemId); }],
    ["sequence switched off", async (p: Awaited<ReturnType<typeof purchase>>) => { await createServiceClient().from("post_purchase_sequences").update({ enabled: false }).eq("owner_id", p.offerId); }],
  ])("stops the rest when the %s", async (reason, act) => {
    const p = await purchase();
    const t0 = new Date();
    await queueSequencesForOrder(p.orderId, t0);
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
    await act(p);
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * DAY) });
    const rows = await sends(p.itemId);
    expect(rows.map((r) => [r.position, r.status, r.reason])).toEqual([[1, "sent", null], [2, "skipped", reason]]);
    expect(sent.filter((s) => s.to === p.email)).toHaveLength(1);
  });

  it("an email deleted mid-sequence is skipped and the next one goes, once", async () => {
    const p = await purchase();
    const t0 = new Date();
    await queueSequencesForOrder(p.orderId, t0);
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) }); // One sent, Two pending
    const seq = await getSequence("offer", p.offerId);
    await saveSequence({ ownerType: "offer", ownerId: p.offerId, enabled: true, layout: LAYOUT_DEFAULTS, emails: [seq.emails[0], seq.emails[2]] });
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * DAY) });
    expect(sent.filter((s) => s.to === p.email).map((s) => s.subject)).toEqual(["One", "Three"]);
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 30 * DAY) });
    expect(sent.filter((s) => s.to === p.email)).toHaveLength(2);
  });

  it("a reorder mid-sequence sends every email once, none twice, none lost", async () => {
    const p = await purchase();
    const t0 = new Date();
    await queueSequencesForOrder(p.orderId, t0);
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) }); // One sent, Two pending
    const [one, two, three] = (await getSequence("offer", p.offerId)).emails;
    await saveSequence({ ownerType: "offer", ownerId: p.offerId, enabled: true, layout: LAYOUT_DEFAULTS, emails: [three, two, one] });
    for (const d of [3, 6, 9, 30]) await sendDueSequenceEmails({ now: new Date(t0.getTime() + d * DAY) });
    expect(sent.filter((s) => s.to === p.email).map((s) => s.subject)).toEqual(["One", "Two", "Three"]);
  });

  it("a send the provider refuses is recorded, shown on Errors, and ends the chain", async () => {
    const p = await purchase();
    const t0 = new Date();
    await queueSequencesForOrder(p.orderId, t0);
    nextResult = "failed";
    await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
    const rows = await sends(p.itemId);
    expect(rows.map((r) => [r.position, r.status])).toEqual([[1, "failed"]]);
    const { data: errs } = await createServiceClient().from("error_events").select("source, context").eq("source", "post_purchase_sequence").order("created_at", { ascending: false }).limit(5);
    expect((errs ?? []).some((e) => (e.context as { orderItemId?: string }).orderItemId === p.itemId)).toBe(true);
  });

  it("the checkout ending queues the sequence even with the welcome email off", async () => {
    const { sendPostPurchaseIfDue } = await import("@/lib/post-purchase-send");
    const p = await purchase();
    // The welcome is pinned off by this file's settings mock.
    const res = await sendPostPurchaseIfDue(p.orderId);
    expect(res).toBe("disabled");
    expect((await sends(p.itemId)).map((r) => r.position)).toEqual([1]);
  });
});

afterAll(async () => {
  if (!canRun) return;
  const db = createServiceClient();
  for (const u of users) {
    await db.from("ownership").delete().eq("user_id", u);
    const { data: orders } = await db.from("orders").select("id").eq("user_id", u);
    for (const o of orders ?? []) {
      const { data: items } = await db.from("order_items").select("id").eq("order_id", o.id);
      for (const i of items ?? []) {
        await db.from("post_purchase_sends").delete().eq("order_item_id", i.id);
        await db.from("error_events").delete().eq("source", "post_purchase_sequence").contains("context", { orderItemId: i.id });
      }
      await db.from("order_items").delete().eq("order_id", o.id);
    }
    await db.from("orders").delete().eq("user_id", u);
    await db.from("users").delete().eq("id", u);
    await db.auth.admin.deleteUser(u);
  }
  for (const o of offers) {
    await db.from("post_purchase_sequences").delete().eq("owner_id", o);
    await db.from("offers").delete().eq("id", o);
  }
});

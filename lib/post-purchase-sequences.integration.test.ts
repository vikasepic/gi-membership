import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const sent: { to: string; subject: string; headers?: Record<string, string> }[] = [];
let nextResult: "sent" | "failed" | "disabled" = "sent";
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendEmail: async (to: string, mail: { subject: string }, over?: { headers?: Record<string, string> }) => {
    if (nextResult === "sent") sent.push({ to, subject: mail.subject, headers: over?.headers });
    return nextResult;
  },
}));
// Pinned rather than read from the local store: tests switch the welcome per case.
const settings = vi.hoisted(() => ({ welcome: false }));
vi.mock("@/lib/settings", () => ({
  getSettingsOrDefaults: async () => ({
    postPurchaseEmail: { enabled: settings.welcome, accessUrl: "https://grow.greaterinside.com/login", senderName: "Ajit", senderEmail: "ajit@example.com", replyTo: "" },
  }),
}));

const { createServiceClient } = await import("@/lib/supabase/server");
const { getStoreId } = await import("@/lib/store");
const { saveSequence, getSequence } = await import("@/lib/post-purchase-store");
const { startFlowsForOrder, requeueMissedSequences, sendDueSequenceEmails } = await import("@/lib/post-purchase-sequences");
const { LAYOUT_DEFAULTS, starterDoc } = await import("@/lib/post-purchase-layout");

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = "00000000-0000-0000-0000-0000000000a1";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const users: string[] = [];
const offers: string[] = [];
const sequences: string[] = [];
let storeId = "";
/** A store series a developer made locally. The store tests skip rather than overwrite it. */
let devStoreSeries = false;

beforeEach(() => {
  sent.length = 0;
  nextResult = "sent";
  settings.welcome = false;
});

type Buyer = { userId: string; email: string };
type Bought = { orderId: string; itemId: string };

describe.skipIf(!canRun)("post-purchase flows (integration)", () => {
  beforeAll(async () => {
    storeId = await getStoreId();
    devStoreSeries = !!(await getSequence("store", storeId)).id;
  });

  const db = () => createServiceClient();
  /** A prefix that makes this test's subjects its own, whatever else is in the shared store. */
  const tag = () => `T${Math.random().toString(36).slice(2, 8)}`;
  const mine = (email: string, t: string) =>
    sent.filter((s) => s.to === email && s.subject.startsWith(`${t} `)).map((s) => s.subject.slice(t.length + 1));

  async function makeOffer(): Promise<string> {
    const id = crypto.randomUUID();
    offers.push(id);
    const r = await db().from("offers").insert({
      id, store_id: storeId, key: `zz-ppf-${id}`, name: "zz Funnel App", grant_type: "subscription",
      grant_app_id: APP, grant_entitlement_key: `zz-ppf-${id}`, grant_channels: [], billing_type: "one_time",
      price_cents: 2900, currency: "usd", headline: "fixture", description: "fixture",
    });
    if (r.error) throw new Error(`fixture offer: ${r.error.message}`);
    return id;
  }

  async function series(ownerType: "offer" | "store", ownerId: string, subjects: string[], opts: { delays?: number[]; unit?: "hours" | "days"; enabled?: boolean } = {}) {
    const res = await saveSequence({
      ownerType, ownerId, enabled: opts.enabled ?? true, layout: LAYOUT_DEFAULTS,
      emails: subjects.map((subject, i) => ({ id: null, delayAmount: opts.delays?.[i] ?? 2, delayUnit: opts.unit ?? "days", subject, preheader: "", doc: starterDoc("x") })),
    });
    if (!res.ok) throw new Error(res.error);
    const seq = await getSequence(ownerType, ownerId);
    sequences.push(seq.id!);
    return seq;
  }

  async function buyer(email = `zzppf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`): Promise<Buyer> {
    const created = await db().auth.admin.createUser({ email, password: "password12345", email_confirm: true });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    users.push(userId);
    await db().from("users").insert({ id: userId, store_id: storeId, email, username: "Priya Shah" });
    return { userId, email };
  }

  async function buy(b: Buyer, offerId: string, opts: { kind?: string; email?: string } = {}): Promise<Bought> {
    const { data: order, error } = await db().from("orders")
      .insert({ store_id: storeId, user_id: b.userId, email: opts.email ?? b.email, status: "paid", total_cents: 2900, subtotal_cents: 2900, currency: "usd" })
      .select("id").single();
    if (error || !order) throw new Error(`fixture order: ${error?.message}`);
    const { data: item } = await db().from("order_items")
      .insert({ store_id: storeId, order_id: order.id, kind: opts.kind ?? "oto", description: "zz Funnel App", amount_cents: 2900, offer_id: offerId })
      .select("id").single();
    const { data: held } = await db().from("ownership").select("id").eq("user_id", b.userId).eq("offer_id", offerId).limit(1);
    if (!held?.length) {
      const own = await db().from("ownership").insert({ store_id: storeId, user_id: b.userId, app_id: APP, offer_id: offerId, status: "active", source: "purchase" });
      if (own.error) throw new Error(`fixture ownership: ${own.error.message}`);
    }
    return { orderId: order.id as string, itemId: item!.id as string };
  }

  async function flowOf(sequenceId: string, email: string) {
    const { data } = await db().from("post_purchase_flows").select("id, status, run, order_id").eq("sequence_id", sequenceId).eq("email", email.toLowerCase()).maybeSingle();
    return data as { id: string; status: string; run: number; order_id: string | null } | null;
  }

  async function sendsOf(flowId: string) {
    const { data } = await db().from("post_purchase_sends").select("run, position, status, reason, due_at, email_id").eq("flow_id", flowId).order("run").order("position");
    return (data ?? []) as { run: number; position: number; status: string; reason: string | null; due_at: string; email_id: string | null }[];
  }

  describe("item flows", () => {
    it("a first purchase starts the item's flow: email 1 a minute after checkout, processed once", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const now = new Date();
      expect(await startFlowsForOrder(o.orderId, now)).toBeGreaterThanOrEqual(1);
      expect(await startFlowsForOrder(o.orderId, now)).toBe(0);
      const flow = (await flowOf(seq.id!, b.email))!;
      expect(flow).toMatchObject({ status: "running", run: 1, order_id: o.orderId });
      const rows = await sendsOf(flow.id);
      expect(rows.map((r) => [r.run, r.position, r.status])).toEqual([[1, 1, "pending"]]);
      expect(new Date(rows[0].due_at).getTime()).toBe(now.getTime() + 60_000);
    });

    it("a renewal starts nothing, and the order is still marked processed", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`]);
      const b = await buyer();
      const o = await buy(b, offer, { kind: "renewal" });
      expect(await startFlowsForOrder(o.orderId)).toBe(0);
      expect(await flowOf(seq.id!, b.email)).toBeNull();
      const { data } = await db().from("orders").select("post_purchase_flows_at").eq("id", o.orderId).single();
      expect(data!.post_purchase_flows_at).not.toBeNull();
    });

    it("sends email 1 once without a stop link, then email 2 its delay later with one, then the flow is done", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o.orderId, t0);
      const at = new Date(t0.getTime() + 61_000);
      await Promise.all([sendDueSequenceEmails({ now: at }), sendDueSequenceEmails({ now: at })]);
      expect(mine(b.email, t)).toEqual(["One"]);
      expect(sent.find((s) => s.subject === `${t} One`)?.headers).toBeUndefined();
      const flow = (await flowOf(seq.id!, b.email))!;
      const rows = await sendsOf(flow.id);
      expect(rows.map((r) => [r.position, r.status])).toEqual([[1, "sent"], [2, "pending"]]);
      expect(new Date(rows[1].due_at).getTime()).toBe(at.getTime() + 2 * DAY);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * DAY) });
      expect(sent.find((s) => s.subject === `${t} Two`)?.headers?.["List-Unsubscribe"]).toMatch(/\/email\/stop\?t=/);
      expect((await flowOf(seq.id!, b.email))!.status).toBe("done");
    });

    type Case = { orderId: string; userId: string; offer: string; seqId: string };
    it.each([
      ["order refunded", async (x: Case) => { await db().from("orders").update({ status: "refunded" }).eq("id", x.orderId); }],
      ["access ended", async (x: Case) => { await db().from("ownership").update({ status: "canceled" }).eq("user_id", x.userId).eq("offer_id", x.offer); }],
      ["sequence switched off", async (x: Case) => { await db().from("post_purchase_sequences").update({ enabled: false }).eq("id", x.seqId); }],
    ])("ends the flow when the %s", async (reason, act) => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      await act({ orderId: o.orderId, userId: b.userId, offer, seqId: seq.id! });
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * DAY) });
      const flow = (await flowOf(seq.id!, b.email))!;
      expect((await sendsOf(flow.id)).map((r) => [r.position, r.status, r.reason])).toEqual([[1, "sent", null], [2, "skipped", reason]]);
      expect(flow.status).toBe("done");
      expect(mine(b.email, t)).toEqual(["One"]);
    });

    it("buying the same thing again while its flow runs sends no second copy", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o1 = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o1.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      const o2 = await buy(b, offer);
      await startFlowsForOrder(o2.orderId, new Date(t0.getTime() + HOUR));
      const flow = (await flowOf(seq.id!, b.email))!;
      expect(flow).toMatchObject({ run: 1, status: "running", order_id: o1.orderId });
      expect((await sendsOf(flow.id)).map((r) => [r.position, r.status])).toEqual([[1, "sent"], [2, "pending"]]);
    });

    it("buying again after the flow finished starts it from email 1, as run 2", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`]);
      const b = await buyer();
      const o1 = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o1.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      expect((await flowOf(seq.id!, b.email))!.status).toBe("done");
      const o2 = await buy(b, offer);
      const t1 = new Date(t0.getTime() + 5 * DAY);
      await startFlowsForOrder(o2.orderId, t1);
      const flow = (await flowOf(seq.id!, b.email))!;
      expect(flow).toMatchObject({ run: 2, status: "running", order_id: o2.orderId });
      const run2 = (await sendsOf(flow.id)).filter((r) => r.run === 2);
      expect(run2.map((r) => [r.position, r.status])).toEqual([[1, "pending"]]);
      expect(new Date(run2[0].due_at).getTime()).toBe(t1.getTime() + 60_000);
      await sendDueSequenceEmails({ now: new Date(t1.getTime() + 61_000) });
      expect(mine(b.email, t)).toEqual(["One", "One"]);
    });

    it("a paused flow resumes on the buyer's next purchase of anything, after its own delay", async () => {
      const t = tag();
      const a = await makeOffer();
      const seq = await series("offer", a, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o1 = await buy(b, a);
      const t0 = new Date();
      await startFlowsForOrder(o1.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      const before = (await flowOf(seq.id!, b.email))!;
      // What the stop link does (Task 4 tests the link itself).
      await db().from("post_purchase_flows").update({ status: "paused" }).eq("id", before.id);
      await db().from("post_purchase_sends").update({ status: "skipped", reason: "buyer stopped these emails" }).eq("flow_id", before.id).eq("status", "pending");
      const other = await makeOffer();
      const o2 = await buy(b, other);
      const t1 = new Date(t0.getTime() + 10 * DAY);
      await startFlowsForOrder(o2.orderId, t1);
      const flow = (await flowOf(seq.id!, b.email))!;
      expect(flow).toMatchObject({ status: "running", order_id: o2.orderId });
      const rows = await sendsOf(flow.id);
      expect(rows.map((r) => [r.position, r.status])).toEqual([[1, "sent"], [2, "skipped"], [3, "pending"]]);
      expect(new Date(rows[2].due_at).getTime()).toBe(t1.getTime() + 2 * DAY);
      await sendDueSequenceEmails({ now: new Date(t1.getTime() + 2 * DAY + 1000) });
      expect(mine(b.email, t)).toEqual(["One", "Two"]);
      expect((await flowOf(seq.id!, b.email))!.status).toBe("done");
    });

    it("a paused flow's queued email is skipped at send time and the flow stays paused", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o.orderId, t0);
      const flow = (await flowOf(seq.id!, b.email))!;
      await db().from("post_purchase_flows").update({ status: "paused" }).eq("id", flow.id);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      expect((await sendsOf(flow.id)).map((r) => [r.status, r.reason])).toEqual([["skipped", "buyer stopped these emails"]]);
      expect((await flowOf(seq.id!, b.email))!.status).toBe("paused");
      expect(mine(b.email, t)).toEqual([]);
    });

    it("a sequence switched off leaves a paused buyer paused when they buy again", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o1 = await buy(b, offer);
      await startFlowsForOrder(o1.orderId);
      const flow = (await flowOf(seq.id!, b.email))!;
      await db().from("post_purchase_flows").update({ status: "paused" }).eq("id", flow.id);
      await db().from("post_purchase_sequences").update({ enabled: false }).eq("id", seq.id!);
      const o2 = await buy(b, await makeOffer());
      await startFlowsForOrder(o2.orderId);
      expect((await flowOf(seq.id!, b.email))!.status).toBe("paused");
    });

    it("the same buyer with a differently cased email is one buyer, one flow", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o1 = await buy(b, offer);
      await startFlowsForOrder(o1.orderId);
      const o2 = await buy(b, offer, { email: b.email.toUpperCase() });
      await startFlowsForOrder(o2.orderId);
      const { data } = await db().from("post_purchase_flows").select("id").eq("sequence_id", seq.id!);
      expect(data).toHaveLength(1);
      expect(await sendsOf(data![0].id as string)).toHaveLength(1);
    });

    it("an email deleted mid-flow is skipped and the next one goes, once", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`, `${t} Three`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      const [one, , three] = (await getSequence("offer", offer)).emails;
      await saveSequence({ ownerType: "offer", ownerId: offer, enabled: true, layout: LAYOUT_DEFAULTS, emails: [one, three] });
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * DAY) });
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 30 * DAY) });
      expect(mine(b.email, t)).toEqual(["One", "Three"]);
      expect(seq.id).toBeTruthy();
    });

    it("a reorder mid-flow sends every email once, none twice, none lost", async () => {
      const t = tag();
      const offer = await makeOffer();
      await series("offer", offer, [`${t} One`, `${t} Two`, `${t} Three`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      const [one, two, three] = (await getSequence("offer", offer)).emails;
      await saveSequence({ ownerType: "offer", ownerId: offer, enabled: true, layout: LAYOUT_DEFAULTS, emails: [three, two, one] });
      for (const d of [3, 6, 9, 30]) await sendDueSequenceEmails({ now: new Date(t0.getTime() + d * DAY) });
      expect(mine(b.email, t)).toEqual(["One", "Two", "Three"]);
    });

    it("a send the provider refuses is recorded and ends the chain", async () => {
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`, `${t} Two`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o.orderId, t0);
      nextResult = "failed";
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      const flow = (await flowOf(seq.id!, b.email))!;
      expect((await sendsOf(flow.id)).map((r) => [r.position, r.status])).toEqual([[1, "failed"]]);
      const { data: errs } = await db().from("error_events").select("context").eq("source", "post_purchase_sequence").order("created_at", { ascending: false }).limit(20);
      expect((errs ?? []).some((e) => (e.context as { flowId?: string }).flowId === flow.id)).toBe(true);
    });

    it("the checkout ending starts flows even with the welcome off", async () => {
      const { sendPostPurchaseIfDue } = await import("@/lib/post-purchase-send");
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`]);
      const b = await buyer();
      const o = await buy(b, offer);
      expect(await sendPostPurchaseIfDue(o.orderId)).toBe("disabled");
      expect((await flowOf(seq.id!, b.email))?.status).toBe("running");
    });
    it("stop pauses every flow for the buyer and skips what is queued; buying again resumes each, once", async () => {
      const { stopBuyer } = await import("@/lib/post-purchase-stop");
      const t = tag();
      const a = await makeOffer();
      const seqA = await series("offer", a, [`${t} A1`, `${t} A2`]);
      const c = await makeOffer();
      const seqC = await series("offer", c, [`${t} C1`, `${t} C2`]);
      const b = await buyer();
      const t0 = new Date();
      await startFlowsForOrder((await buy(b, a)).orderId, t0);
      await startFlowsForOrder((await buy(b, c)).orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 61_000) });
      const flowA = (await flowOf(seqA.id!, b.email))!;
      const flowC = (await flowOf(seqC.id!, b.email))!;

      expect(await stopBuyer(flowA.id)).toEqual({ ok: true });
      expect((await flowOf(seqA.id!, b.email))!.status).toBe("paused");
      expect((await flowOf(seqC.id!, b.email))!.status).toBe("paused");
      expect((await sendsOf(flowC.id)).map((r) => [r.position, r.status, r.reason])).toEqual([[1, "sent", null], [2, "skipped", "buyer stopped these emails"]]);
      // A second click changes nothing.
      expect(await stopBuyer(flowA.id)).toEqual({ ok: true });

      // Nothing goes out while stopped.
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 5 * DAY) });
      expect(mine(b.email, t).sort()).toEqual(["A1", "C1"]);

      // Buying anything resumes both, each after its own delay from that purchase, once.
      const t1 = new Date(t0.getTime() + 6 * DAY);
      await startFlowsForOrder((await buy(b, await makeOffer())).orderId, t1);
      await sendDueSequenceEmails({ now: new Date(t1.getTime() + 2 * DAY + 1000) });
      await sendDueSequenceEmails({ now: new Date(t1.getTime() + 30 * DAY) });
      expect(mine(b.email, t).sort()).toEqual(["A1", "A2", "C1", "C2"]);
    });
  });

  describe("the re-queue sweep", () => {
    it("processes a paid order the checkout step missed, once, even after its flow finished", async () => {
      settings.welcome = true;
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const now = new Date();
      await db().from("orders").update({ created_at: new Date(now.getTime() - 20 * 60_000).toISOString(), post_purchase_sent_at: now.toISOString() }).eq("id", o.orderId);
      expect(await requeueMissedSequences(now)).toBeGreaterThanOrEqual(1);
      await sendDueSequenceEmails({ now: new Date(now.getTime() + 61_000) });
      expect((await flowOf(seq.id!, b.email))!.status).toBe("done");
      await requeueMissedSequences(new Date(now.getTime() + 2 * 60_000));
      expect((await flowOf(seq.id!, b.email))).toMatchObject({ status: "done", run: 1 });
    });

    it("leaves an order whose upsell is still open", async () => {
      settings.welcome = true;
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const now = new Date();
      await db().from("orders").update({ created_at: new Date(now.getTime() - 20 * 60_000).toISOString(), post_purchase_sent_at: now.toISOString() }).eq("id", o.orderId);
      const tok = await db().from("oto_tokens").insert({
        store_id: storeId, order_id: o.orderId, user_id: b.userId, offer_id: offer,
        token_hash: `zz-ppf-${crypto.randomUUID()}`, status: "pending", expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
      });
      if (tok.error) throw new Error(`fixture oto token: ${tok.error.message}`);
      await requeueMissedSequences(now);
      expect(await flowOf(seq.id!, b.email)).toBeNull();
    });

    it("leaves an order whose welcome is still to come", async () => {
      settings.welcome = true;
      const t = tag();
      const offer = await makeOffer();
      const seq = await series("offer", offer, [`${t} One`]);
      const b = await buyer();
      const o = await buy(b, offer);
      const now = new Date();
      await db().from("orders").update({ created_at: new Date(now.getTime() - 20 * 60_000).toISOString() }).eq("id", o.orderId);
      await requeueMissedSequences(now);
      expect(await flowOf(seq.id!, b.email)).toBeNull();
    });
  });

  describe("the store series", () => {
    it("a first purchase starts it after the welcome; a later purchase adds nothing", async (ctx) => {
      if (devStoreSeries) return ctx.skip();
      const t = tag();
      const store = await series("store", storeId, [`${t} S1 {{offer_name}}`, `${t} S2`], { delays: [3, 2], unit: "hours" });
      const offer = await makeOffer();
      const b = await buyer();
      const o1 = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o1.orderId, t0);
      const flow = (await flowOf(store.id!, b.email))!;
      const rows = await sendsOf(flow.id);
      expect(rows.map((r) => [r.position, r.status])).toEqual([[1, "pending"]]);
      expect(new Date(rows[0].due_at).getTime()).toBe(t0.getTime() + 3 * HOUR);
      const o2 = await buy(b, offer);
      await startFlowsForOrder(o2.orderId, new Date(t0.getTime() + HOUR));
      expect(await sendsOf(flow.id)).toHaveLength(1);
      expect((await flowOf(store.id!, b.email))!.order_id).toBe(o1.orderId);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * HOUR + 1000) });
      // "What they bought" is the first item of the purchase that started it; every store email can be stopped.
      const s1 = sent.find((s) => s.to === b.email && s.subject === `${t} S1 zz Funnel App`);
      expect(s1?.headers?.["List-Unsubscribe"]).toMatch(/\/email\/stop\?t=/);
    });

    it("a finished store series stays finished after a stop and a new purchase", async (ctx) => {
      if (devStoreSeries) return ctx.skip();
      const t = tag();
      const store = await series("store", storeId, [`${t} S1`], { delays: [1], unit: "hours" });
      const offer = await makeOffer();
      const b = await buyer();
      const o1 = await buy(b, offer);
      const t0 = new Date();
      await startFlowsForOrder(o1.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + HOUR + 1000) });
      const flow = (await flowOf(store.id!, b.email))!;
      expect(flow.status).toBe("done");
      const o2 = await buy(b, offer);
      await startFlowsForOrder(o2.orderId, new Date(t0.getTime() + 2 * DAY));
      expect((await flowOf(store.id!, b.email))!.status).toBe("done");
      expect(await sendsOf(flow.id)).toHaveLength(1);
    });

    it("ends when every order of that buyer is refunded, and only that buyer's", async (ctx) => {
      if (devStoreSeries) return ctx.skip();
      const t = tag();
      const store = await series("store", storeId, [`${t} S1`, `${t} S2`], { delays: [1, 1], unit: "hours" });
      const offer = await makeOffer();
      const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      // B's address matches A's if the underscore were a LIKE wildcard.
      const a = await buyer(`zz_a${stamp}@example.com`);
      const bb = await buyer(`zzxa${stamp}@example.com`);
      const oa = await buy(a, offer);
      const t0 = new Date();
      await startFlowsForOrder(oa.orderId, t0);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + HOUR + 1000) });
      await db().from("orders").update({ status: "refunded" }).eq("id", oa.orderId);
      await buy(bb, offer);
      await sendDueSequenceEmails({ now: new Date(t0.getTime() + 3 * HOUR) });
      const flow = (await flowOf(store.id!, a.email))!;
      expect((await sendsOf(flow.id)).map((r) => [r.position, r.status, r.reason])).toEqual([[1, "sent", null], [2, "skipped", "every order refunded"]]);
      expect(flow.status).toBe("done");
    });
  });
});

afterAll(async () => {
  if (!canRun) return;
  const c = createServiceClient();
  const seqIds = [...new Set(sequences)];
  if (seqIds.length) {
    const { data: flows } = await c.from("post_purchase_flows").select("id").in("sequence_id", seqIds);
    for (const f of flows ?? []) await c.from("error_events").delete().eq("source", "post_purchase_sequence").contains("context", { flowId: f.id });
    // Emails, flows and sends go with their sequence (on delete cascade).
    await c.from("post_purchase_sequences").delete().in("id", seqIds);
  }
  for (const u of users) {
    await c.from("ownership").delete().eq("user_id", u);
    const { data: orders } = await c.from("orders").select("id").eq("user_id", u);
    for (const o of orders ?? []) {
      await c.from("oto_tokens").delete().eq("order_id", o.id);
      await c.from("order_items").delete().eq("order_id", o.id);
    }
    await c.from("orders").delete().eq("user_id", u);
    await c.from("users").delete().eq("id", u);
    await c.auth.admin.deleteUser(u);
  }
  for (const o of offers) await c.from("offers").delete().eq("id", o);
});

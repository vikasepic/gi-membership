import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type Stripe from "stripe";

const sent: { to: string; subject: string; html: string; from?: string; replyTo?: string }[] = [];
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendEmail: async (to: string, mail: { subject: string; html: string }, over?: { from?: string; replyTo?: string }) => {
    sent.push({ to, subject: mail.subject, html: mail.html, from: over?.from, replyTo: over?.replyTo });
    return "sent";
  },
}));
// Pinned rather than read from the local store, so a developer's own settings cannot move these.
const settings = vi.hoisted(() => ({ renewal: true }));
vi.mock("@/lib/settings", async (orig) => ({
  ...(await orig<typeof import("@/lib/settings")>()),
  getSettingsOrDefaults: async () => {
    const { SETTINGS_DEFAULTS } = await import("@/lib/settings-schema");
    return {
      ...SETTINGS_DEFAULTS,
      postPurchaseEmail: { ...SETTINGS_DEFAULTS.postPurchaseEmail, enabled: true, senderName: "Ajit", senderEmail: "ajit@example.com", replyTo: "help@example.com" },
      renewalEmail: { ...SETTINGS_DEFAULTS.renewalEmail, enabled: settings.renewal },
    };
  },
}));

const { createServiceClient } = await import("@/lib/supabase/server");
const { getStoreId } = await import("@/lib/store");
const { recordRenewal } = await import("@/lib/renewals");
const { sendPostPurchaseIfDue } = await import("@/lib/post-purchase-send");

const canRun = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const users: string[] = [];
let storeId = "";

beforeEach(() => {
  sent.length = 0;
  settings.renewal = true;
});

describe.skipIf(!canRun)("the renewal email (integration)", () => {
  beforeAll(async () => {
    storeId = await getStoreId();
  });
  const db = () => createServiceClient();
  const rand = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  /** A member who bought a subscription at the checkout, so a renewal can find its origin. */
  async function subscriber(): Promise<{ email: string; sub: string }> {
    const email = `zzrenew_${rand()}@example.com`;
    const created = await db().auth.admin.createUser({ email, password: "password12345", email_confirm: true });
    if (created.error || !created.data.user) throw new Error(created.error?.message);
    const userId = created.data.user.id;
    users.push(userId);
    await db().from("users").insert({ id: userId, store_id: storeId, email, username: "Priya Shah" });
    const sub = `sub_zz_${rand()}`;
    const { data: order, error } = await db().from("orders")
      .insert({ store_id: storeId, user_id: userId, email, status: "paid", total_cents: 0, subtotal_cents: 0, currency: "usd" })
      .select("id").single();
    if (error || !order) throw new Error(`fixture order: ${error?.message}`);
    const item = await db().from("order_items").insert({
      store_id: storeId, order_id: order.id, kind: "product", description: "zz Funnel App", amount_cents: 0, stripe_subscription_id: sub,
    });
    if (item.error) throw new Error(`fixture item: ${item.error.message}`);
    return { email, sub };
  }

  function invoice(sub: string, over: { reason?: string; metadata?: Record<string, string> } = {}): Stripe.Invoice {
    const now = Math.floor(Date.now() / 1000);
    return {
      id: `in_zz_${rand()}`,
      billing_reason: over.reason ?? "subscription_cycle",
      amount_paid: 2900,
      subtotal: 2900,
      currency: "usd",
      livemode: false,
      created: now,
      status_transitions: { paid_at: now },
      total_taxes: [],
      parent: { subscription_details: { subscription: sub, metadata: over.metadata ?? {} } },
      lines: { data: [{ description: "1 × zz Funnel App (at $29.00 / month)", period: { start: now, end: now + 30 * 86_400 } }] },
    } as unknown as Stripe.Invoice;
  }

  it("a renewal gets the thank-you, from the welcome's sender, instead of the plain receipt", async () => {
    const s = await subscriber();
    const res = await recordRenewal(invoice(s.sub), { track: false });
    expect(res.recorded).toBe(true);
    const mine = sent.filter((m) => m.to === s.email);
    expect(mine.map((m) => m.subject)).toEqual(["thank you, your zz Funnel App has renewed"]);
    expect(mine[0].html).toContain("hi Priya,");
    expect(mine[0].from).toBe("Ajit <ajit@example.com>");
    expect(mine[0].replyTo).toBe("help@example.com");
  });

  it("switched off, it sends the plain receipt as before", async () => {
    settings.renewal = false;
    const s = await subscriber();
    await recordRenewal(invoice(s.sub), { track: false });
    expect(sent.filter((m) => m.to === s.email).map((m) => m.subject)).toEqual(["Your receipt from Greater Inside · $29.00"]);
  });

  it("an instalment of a payment plan keeps the plain receipt: it did not renew", async () => {
    const s = await subscriber();
    await recordRenewal(invoice(s.sub, { metadata: { installments: "3" } }), { track: false });
    expect(sent.filter((m) => m.to === s.email).map((m) => m.subject)).toEqual(["Your receipt from Greater Inside · $29.00"]);
  });

  it("a plan change keeps the plain receipt too", async () => {
    const s = await subscriber();
    await recordRenewal(invoice(s.sub, { reason: "subscription_update" }), { track: false });
    expect(sent.filter((m) => m.to === s.email).map((m) => m.subject)).toEqual(["Your receipt from Greater Inside · $29.00"]);
  });

  it("a renewal order never gets the welcome email", async () => {
    const s = await subscriber();
    const res = await recordRenewal(invoice(s.sub), { track: false, receipt: false });
    if (!res.recorded) throw new Error(res.reason);
    expect(await sendPostPurchaseIfDue(res.orderId)).toBe("renewal");
    expect(sent.filter((m) => m.to === s.email)).toEqual([]);
    const { data } = await db().from("orders").select("post_purchase_sent_at").eq("id", res.orderId).single();
    expect(data!.post_purchase_sent_at).toBeNull();
  });
});

afterAll(async () => {
  if (!canRun) return;
  const c = createServiceClient();
  for (const u of users) {
    const { data: orders } = await c.from("orders").select("id").eq("user_id", u);
    for (const o of orders ?? []) await c.from("order_items").delete().eq("order_id", o.id);
    await c.from("orders").delete().eq("user_id", u);
    await c.from("users").delete().eq("id", u);
    await c.auth.admin.deleteUser(u);
  }
});

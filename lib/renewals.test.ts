import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { subscriptionIdOf } from "@/lib/renewals";

/**
 * The money that arrives after the checkout.
 *
 * A subscription produced exactly one order: the one made at the checkout,
 * which on a 7-day trial is $0. The real charge on day 7, and every renewal
 * after it, reached Stripe and nothing else — no order, no receipt, no
 * conversion event.
 *
 * The bookkeeping was the smaller half. Meta was told StartTrial at signup and
 * never told the trial converted, so the only purchase signal it could
 * optimise towards was people who take free trials.
 */

const renewals = readFileSync("lib/renewals.ts", "utf8");
const hook = readFileSync("app/api/webhooks/stripe/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/0062_renewal_orders.sql", "utf8");

describe("which invoices count", () => {
  it("a renewal cycle does", () => {
    expect(renewals).toContain('"subscription_cycle"');
  });

  it("the checkout's own invoice does NOT, unless nothing on our side ever recorded that sale", () => {
    // `subscription_create` is raised by the checkout. That sale is already an
    // order and already a Purchase; recording it here would count it twice.
    // The one exception is a subscription a connected app started, which has
    // no order at all — its first charge is real money with no row, and it
    // is let through only when the origin came from the access row.
    expect(renewals).toContain("RENEWAL_REASONS.has(reason)");
    expect(renewals).toContain("if (firstCharge && origin.fromOrder) return");
    expect(renewals).toContain("fromOrder: true");
    expect(renewals).toContain("fromOrder: false");
  });

  it("an invoice that charged nothing does not", () => {
    // A trial period rolling over, or a credit covering the whole amount.
    expect(renewals).toContain("if (amountCents <= 0)");
  });
});

describe("recording it once", () => {
  it("leans on the database, not a check-then-insert", () => {
    // Stripe redelivers on any non-2xx and on its own schedule. Two deliveries
    // racing would both read "no order yet" and both write one — on the single
    // webhook that arrives every month for the life of every subscription.
    expect(migration).toContain("create unique index if not exists orders_invoice_uq");
    expect(migration).toContain("where stripe_invoice_id is not null");
    expect(renewals).toContain('error.code === "23505"');
  });

  it("treats the duplicate as success, not as a failure to retry", () => {
    // It never throws on 23505, and every path out of that branch reports a
    // reason beginning "already recorded" — the caller counts it as skipped,
    // not as work to retry.
    expect(renewals).toMatch(/23505"\) \{/);
    expect(renewals).toMatch(/return \{ recorded: false, reason: fixed\?\.length \? "already recorded, date corrected" : "already recorded" \}/);
  });
});

describe("who the renewal belongs to", () => {
  // Scoped to the orders INSERT itself, not the whole file — every one of
  // these field names also appears in the SELECT a few dozen lines down
  // (line ~244, reading the origin order back), so an unscoped
  // `renewals.toContain(f)` passes on that alone and would not fail if the
  // corresponding `f: origin.x` line were deleted from the INSERT below.
  const insert = renewals.slice(
    renewals.indexOf("const { data: created, error } = await db"),
    renewals.indexOf('.select("id")'),
  );

  it("is found through the subscription, not the customer", () => {
    // One Stripe customer can hold several subscriptions.
    expect(renewals).toContain('.eq("stripe_subscription_id", subscriptionId)');
  });

  it("reaches the SALE rather than the previous renewal", () => {
    // A renewal line carries the subscription id too, so newest-first would
    // walk the chain of renewals instead of arriving at the checkout.
    expect(renewals).toContain('.order("created_at", { ascending: true })');
  });

  it("carries the attribution the sale was won with", () => {
    // A conversion with no match data is one Meta can count but not learn from.
    // And a renewal belongs to the campaign that made the sale, so the labels
    // come along with the visitor.
    for (const f of ["visitor_id", "tracking_consent", "buyer_country", "utm_first", "utm_last", "referrer"]) {
      expect(insert, f).toContain(f);
    }
  });
});

describe("what it reports", () => {
  it("is a Purchase for what was actually charged", () => {
    expect(renewals).toContain('eventName: "Purchase"');
    expect(renewals).toContain("valueCents: amountCents");
  });

  it("is keyed on the invoice, which is what a retry agrees on", () => {
    expect(renewals).toContain('eventIdFor("Purchase", invoice.id ?? orderId)');
  });

  it("is dated when the money moved, not when the webhook arrived", () => {
    // A redelivery days later would otherwise report an old sale as today's.
    expect(renewals).toContain("occurredAt: invoice.created");
  });

  it("does not gate on the originating order's consent flag", () => {
    // A subscription sold before the banner came down carries
    // tracking_consent = false forever. Gating on it would mean every renewal
    // of every pre-11-Sep-2026 subscription reports nothing, permanently.
    expect(renewals).not.toContain("origin.trackingConsent ===");
  });
});

describe("what may not fail the webhook", () => {
  it("the receipt and the tracking, both guarded", () => {
    // The money is taken and the order is written. A 500 here has Stripe
    // redeliver an invoice already recorded, which the unique index rejects —
    // turning a missing receipt into an endlessly retried delivery.
    const after = renewals.slice(renewals.indexOf("const description = descriptionOf"));
    expect(after.match(/catch \(e\)/g)!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("the webhook", () => {
  it("listens for it at all", () => {
    expect(hook).toContain('case "invoice.payment_succeeded"');
    expect(hook).toContain("recordRenewal(invoice)");
  });
});

describe("the backfill", () => {
  const fn = renewals.slice(renewals.indexOf("export async function backfillRenewals"));

  it("asks about OUR subscriptions rather than the account's invoices", () => {
    // The first version listed the account's invoices and filtered. This
    // Stripe account is shared with Beam, Flux, Ledger and the rest, so it
    // scanned 500 invoices belonging to other apps without reaching one of
    // ours — and read another app's customers to do it.
    expect(fn).toContain('.select("stripe_subscription_id")');
    expect(fn).toContain("stripe().invoices.list({ subscription: sub");
    expect(fn).not.toMatch(/invoices\.list\(\{ status: "paid", limit/);
  });

  it("asks about each subscription once", () => {
    // One subscription appears on several lines once its renewals are booked.
    expect(fn).toContain("new Set(");
  });

  it("sends no receipts", () => {
    // An email about a charge from three months ago is not a receipt, it is a
    // support ticket.
    expect(fn).toContain("receipt: false");
  });

  it("reports only what Meta would still accept", () => {
    // Seven days. Beyond that the event is refused anyway, and a months-old
    // sale reported as fresh would train delivery on the wrong week.
    expect(renewals).toContain("7 * 24 * 60 * 60");
    expect(fn).toContain("track: (invoice.created ?? 0) >= freshAfter");
  });

  it("is safe to run twice", () => {
    // Every write goes through recordRenewal, so the unique index on the
    // invoice id is what makes the second run a no-op.
    expect(fn).toContain("recordRenewal(invoice,");
    expect(fn).not.toContain(".insert(");
  });

  it("does not stop at the first thing it cannot record", () => {
    // Neither a bad invoice nor a subscription Stripe has forgotten. The rest
    // are still revenue nobody has booked.
    expect(fn).toMatch(/note\(`error:/);
    expect(fn).toMatch(/note\(`subscription \$\{sub\}/);
  });

  it("says why it skipped, counted by reason", () => {
    // "scanned 240, recorded 12" with no breakdown is a number nobody can act
    // on — the reasons are how you tell a working filter from a broken lookup.
    expect(fn).toContain("out.skipped[reason]");
  });
});

describe("the backfill route", () => {
  const route = readFileSync("app/api/cron/backfill-renewals/route.ts", "utf8");

  it("needs the shared secret, and POST", () => {
    expect(route).toContain("export async function POST");
    expect(route).toContain("`Bearer ${secret}`");
    expect(route).not.toContain("export async function GET");
  });

  it("is given room to finish", () => {
    // Hundreds of invoices, each a Stripe round trip.
    expect(route).toContain("maxDuration");
  });
});

describe("subscriptionIdOf", () => {
  const inv = (x: object) => x as unknown as Parameters<typeof subscriptionIdOf>[0];
  it("reads the current API shape, where the id sits under parent", () => {
    expect(subscriptionIdOf(inv({ parent: { subscription_details: { subscription: "sub_new" } } }))).toBe("sub_new");
  });
  it("still reads the older shapes", () => {
    expect(subscriptionIdOf(inv({ subscription: "sub_old" }))).toBe("sub_old");
    expect(subscriptionIdOf(inv({ subscription: { id: "sub_obj" } }))).toBe("sub_obj");
    expect(subscriptionIdOf(inv({ lines: { data: [{ parent: { subscription_item_details: { subscription: "sub_line" } } }] } }))).toBe("sub_line");
  });
  it("is null for a one-off invoice", () => {
    expect(subscriptionIdOf(inv({ parent: { subscription_details: null }, lines: { data: [{ parent: { invoice_item_details: {} } }] } }))).toBeNull();
  });
});

describe("an origin without a consent answer", () => {
  it("writes false, not null — orders.tracking_consent is NOT NULL and null overrides its default", () => {
    expect(renewals).toContain("tracking_consent: origin.trackingConsent ?? false");
  });
});

describe("a renewal order is dated by the invoice", () => {
  it("uses the paid_at transition, not the time the record was written", () => {
    expect(renewals).toContain("const paidAt = new Date(((invoice.status_transitions?.paid_at ?? invoice.created)");
    expect(renewals).toContain("created_at: paidAt,");
  });

  it("corrects a row an earlier run dated wrongly, instead of leaving it", () => {
    // Rows written before the date was taken from the invoice carry the day
    // the backfill ran. The duplicate-key branch is the only place that ever
    // sees them again.
    expect(renewals).toContain('.eq("stripe_invoice_id", invoice.id)');
    expect(renewals).toContain('.neq("created_at", paidAt)');
    expect(renewals).toContain('"already recorded, date corrected"');
  });
});

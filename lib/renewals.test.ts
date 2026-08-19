import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

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

  it("the checkout's own invoice does NOT", () => {
    // `subscription_create` is raised by the checkout. That sale is already an
    // order and already a Purchase; recording it here would count it twice.
    expect(renewals).not.toContain('"subscription_create"');
    expect(renewals).toContain("RENEWAL_REASONS.has(reason)");
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
    expect(renewals).toMatch(/23505"\) return \{ recorded: false, reason: "already recorded" \}/);
  });
});

describe("who the renewal belongs to", () => {
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
    for (const f of ["visitor_id", "tracking_consent", "buyer_country"]) {
      expect(renewals, f).toContain(f);
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

  it("still asks for consent", () => {
    expect(renewals).toContain("origin.trackingConsent === true");
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

  it("does not stop at the first invoice it cannot record", () => {
    // The rest are still revenue nobody has booked.
    expect(fn).toContain("catch (e)");
    expect(fn).toMatch(/note\(`error:/);
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

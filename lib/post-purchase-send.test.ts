import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SETTINGS_DEFAULTS } from "@/lib/settings-schema";

const send = readFileSync("lib/post-purchase-send.ts", "utf8");

/**
 * The send path — an email to a paying customer, so these are invariants.
 *
 * The failure modes are asymmetric and worth naming: sending twice is a buyer
 * who thinks the shop is broken, sending early is a delivery that looks
 * incomplete, and never sending at all is somebody who paid and was told
 * nothing. All three are silent.
 */
describe("it waits for the checkout to actually finish", () => {
  it("holds while an upsell is still in flight", () => {
    // A bump is taken at the checkout and an upsell one page later. Sending at
    // payment can only ever list part of what was bought.
    expect(send).toContain('.eq("status", "pending")');
    expect(send).toContain('return "waiting"');
  });

  it("measures that against the clock, not the row", () => {
    // An abandoned token stays "pending" for ever, so status alone would hold
    // the email back permanently for anyone who closed the tab.
    expect(send).toContain('.gt("expires_at"');
  });

  it("is not a fixed delay", () => {
    // The signal is the funnel ending, which is two minutes for one buyer and
    // twenty for another.
    expect(send).not.toMatch(/setTimeout|sleep\(/);
  });
});

describe("it cannot send twice", () => {
  it("claims the order before sending, not after", () => {
    // The thank-you page and the sweep can arrive together. Claiming first
    // means the loser of that race sends nothing.
    const claim = send.indexOf('.is("post_purchase_sent_at", null)');
    const post = send.indexOf("await sendEmail(");
    expect(claim).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(claim);
  });

  it("returns early on an order already done", () => {
    expect(send).toContain('if (order.post_purchase_sent_at) return "already"');
  });
});

describe("nobody who paid is left with nothing", () => {
  it("sweeps the orders the thank-you page never saw", () => {
    expect(send).toContain("export async function sweepPostPurchaseEmails");
  });

  it("bounds the sweep at both ends", () => {
    // Nothing newer than the grace window, or it races a buyer still reading
    // the upsell; nothing older than a day, or a fault produces a batch of
    // very late welcomes.
    expect(send).toContain("ABANDON_GRACE_MINUTES");
    expect(send).toContain("24 * 60 * 60_000");
  });

  it("does not let one bad order stop the rest", () => {
    const sweep = send.slice(send.indexOf("export async function sweepPostPurchaseEmails"));
    expect(sweep).toContain("try {");
    expect(sweep).toContain("catch");
  });

  it("runs on the cron that already exists", () => {
    const cron = readFileSync("app/api/cron/retry/route.ts", "utf8");
    expect(cron).toContain("sweepPostPurchaseEmails");
  });
});

describe("it replaces the old welcome rather than joining it", () => {
  it("stands the old one down when this is switched on", () => {
    // Two welcomes minutes apart saying the same thing is worse than either.
    const checkout = readFileSync("lib/checkout.ts", "utf8");
    expect(checkout).toContain("postPurchaseEmail.enabled");
    expect(checkout).toContain("if (!ownWelcome)");
  });

  it("leaves the receipt alone", () => {
    // Proof of purchase, and it carries the tax. It is not this email's job.
    const checkout = readFileSync("lib/checkout.ts", "utf8");
    expect(checkout).toContain("buildReceiptEmail(");
    const gate = checkout.slice(checkout.indexOf("const ownWelcome"), checkout.indexOf("buildReceiptEmail("));
    expect(gate).toContain("}"); // the receipt sits outside the welcome's branch
  });

  it("ships switched off", () => {
    expect(SETTINGS_DEFAULTS.postPurchaseEmail.enabled).toBe(false);
  });
});

describe("it never costs a buyer their purchase", () => {
  it("cannot throw out of the thank-you page", () => {
    const actions = readFileSync("app/(store)/checkout/actions.ts", "utf8");
    const fn = actions.slice(actions.indexOf("export async function confirmCheckout"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("try {");
    expect(body).toContain("catch");
  });
});

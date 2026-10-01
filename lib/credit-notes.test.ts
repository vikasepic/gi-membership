import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * A refund made outside the store (in the Stripe dashboard, or the one made
 * by hand on 1 Oct 2026) leaves the invoice saying "paid" in full: Stripe
 * only shows a refund on an invoice through a credit note. This links each
 * refund on a charge to a credit note on its invoice, once.
 */

const calls = vi.hoisted(() => ({ created: [] as { args: Record<string, unknown>; opts?: Record<string, unknown> }[] }));
const state = vi.hoisted(() => ({
  refunds: [] as { id: string; amount: number; status: string }[],
  creditNotes: [] as { refunds: { refund: string | { id: string } }[] }[],
}));
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    refunds: { list: async () => ({ data: state.refunds }) },
    creditNotes: {
      list: async () => ({ data: state.creditNotes }),
      create: async (args: Record<string, unknown>, opts?: Record<string, unknown>) => {
        calls.created.push({ args, opts });
        return { id: "cn_new" };
      },
    },
  }),
}));

const { linkRefundsToInvoice } = await import("@/lib/credit-notes");

beforeEach(() => {
  calls.created.length = 0;
  state.refunds = [];
  state.creditNotes = [];
});

describe("linkRefundsToInvoice", () => {
  it("records each refund on the invoice as a credit note, without emailing the member", async () => {
    state.refunds = [{ id: "re_1", amount: 2900, status: "succeeded" }];
    expect(await linkRefundsToInvoice("in_1", "ch_1")).toBe(1);
    expect(calls.created).toEqual([
      { args: { invoice: "in_1", amount: 2900, refunds: [{ refund: "re_1", amount_refunded: 2900 }], email_type: "none" }, opts: { idempotencyKey: "credit_note_re_1" } },
    ]);
  });

  it("leaves alone a refund that is already on a credit note", async () => {
    // The Refund button makes its refund through a credit note, and that
    // refund then arrives here as charge.refunded like any other.
    state.refunds = [{ id: "re_1", amount: 2900, status: "succeeded" }, { id: "re_2", amount: 500, status: "succeeded" }];
    state.creditNotes = [{ refunds: [{ refund: "re_1" }] }];
    expect(await linkRefundsToInvoice("in_1", "ch_1")).toBe(1);
    expect(calls.created.map((c) => (c.args.refunds as { refund: string }[])[0].refund)).toEqual(["re_2"]);
  });

  it("skips a refund that did not go through", async () => {
    state.refunds = [{ id: "re_f", amount: 2900, status: "failed" }];
    expect(await linkRefundsToInvoice("in_1", "ch_1")).toBe(0);
    expect(calls.created).toEqual([]);
  });
});

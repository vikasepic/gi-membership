import "server-only";
import { stripe } from "@/lib/stripe";

/**
 * Put each refund on a charge onto its invoice as a credit note.
 *
 * Stripe shows a refund on an invoice only through a credit note. A refund
 * made on the charge itself (the Stripe dashboard, or the one made by hand on
 * 1 Oct 2026) leaves the invoice the member downloads saying "paid" in full.
 * The Refund button refunds a renewal through a credit note already, and that
 * refund arrives here like any other, so a refund already on a credit note is
 * skipped. `email_type: none`: whether the member hears about it is the
 * owner's call, not a side effect.
 *
 * Returns how many credit notes it made.
 */
export async function linkRefundsToInvoice(invoiceId: string, chargeId: string): Promise<number> {
  const s = stripe();
  const [{ data: refunds }, { data: notes }] = await Promise.all([
    s.refunds.list({ charge: chargeId, limit: 100 }),
    s.creditNotes.list({ invoice: invoiceId, limit: 100 }),
  ]);
  const linked = new Set(
    notes.flatMap((n) => (n.refunds ?? []).map((r) => (typeof r.refund === "string" ? r.refund : r.refund.id))),
  );
  let made = 0;
  for (const r of refunds) {
    if (r.status !== "succeeded" || linked.has(r.id)) continue;
    await s.creditNotes.create(
      { invoice: invoiceId, amount: r.amount, refunds: [{ refund: r.id, amount_refunded: r.amount }], email_type: "none" },
      { idempotencyKey: `credit_note_${r.id}` },
    );
    made++;
  }
  return made;
}

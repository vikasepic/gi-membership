"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { refundOrder } from "@/lib/orders";
import { money } from "@/lib/money";

export type RefundState = { error?: string; ok?: string };

// Refunding is irreversible and moves real money, so the button that calls this
// requires an explicit typed confirmation in the UI. This re-checks the order id
// server-side rather than trusting anything about how it was submitted.
export async function refundOrderAction(
  _prev: RefundState,
  formData: FormData,
): Promise<RefundState> {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { error: "Missing order." };

  // The typed confirmation never reaches Stripe; it exists so a refund cannot
  // happen from a stray click on a row.
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "REFUND") {
    return { error: 'Type REFUND to confirm.' };
  }

  const res = await refundOrder(orderId);
  if (!res.ok) return { error: res.error };

  revalidatePath("/admin/orders");
  revalidatePath("/admin/members");
  // What Stripe did, with its id, so this can be checked against the
  // dashboard. It said "Refunded" whatever had happened (1 Oct 2026).
  const amount = money(res.refundedCents ?? 0, res.currency ?? "usd");
  return {
    ok: res.alreadyRefunded
      ? "Already refunded in Stripe — records and access are now in step."
      : !res.refundId
        ? "Nothing was charged, so nothing to refund. Access has been withdrawn."
        : res.refundStatus === "pending"
          ? `Refund of ${amount} is pending in Stripe (${res.refundId}). Access has been withdrawn.`
          : `Refunded ${amount} in Stripe (${res.refundId}). Access has been withdrawn.`,
  };
}

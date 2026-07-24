import { redirect } from "next/navigation";
import { finalizeOrder, resolveOtoForOrder } from "@/lib/checkout";

// Post-payment router: finalize the order (idempotent), then branch to the OTO
// if one is eligible, otherwise straight to thank-you.
export default async function CompletePage({
  searchParams,
}: {
  searchParams: Promise<{ payment_intent?: string; redirect_status?: string }>;
}) {
  const { payment_intent, redirect_status } = await searchParams;

  if (!payment_intent || redirect_status !== "succeeded") {
    redirect(`/checkout/thank-you${redirect_status ? `?redirect_status=${redirect_status}` : ""}`);
  }

  await finalizeOrder(payment_intent!);
  const token = await resolveOtoForOrder(payment_intent!);
  if (token) redirect(`/checkout/oto?token=${encodeURIComponent(token)}`);
  redirect(`/checkout/thank-you?payment_intent=${payment_intent}&redirect_status=succeeded`);
}

import { redirect } from "next/navigation";
import { completeOfferCheckout } from "@/lib/offer-checkout";

export const dynamic = "force-dynamic";

// Stripe redirects here after the card is saved. This is where the subscription
// is actually created — completeOfferCheckout is idempotent, so a refresh or a
// double redirect grants once and then no-ops.
export default async function OfferCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ setup_intent?: string }>;
}) {
  const { setup_intent: setupIntentId } = await searchParams;
  if (!setupIntentId) redirect("/library");

  const res = await completeOfferCheckout(setupIntentId);
  redirect(`/library?offer=${res.ok ? "added" : res.error}`);
}

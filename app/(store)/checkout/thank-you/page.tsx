import Link from "next/link";
import { confirmCheckout } from "@/app/(store)/checkout/actions";
import { createClient } from "@/lib/supabase/server";
import { purchaseSummary } from "@/lib/purchase-summary";
import { PurchaseReceipt } from "@/components/checkout/purchase-receipt";
import { TrackPurchase } from "@/components/track-purchase";
import { purchaseForTracking } from "@/lib/tracking-receipt";
import { googleAdsPurchaseLabel } from "@/lib/env";
import { NOINDEX } from "@/lib/seo";

export const metadata = NOINDEX;

// Where every path after payment lands: straight from checkout, or via the
// upsell having been accepted, declined, or failed.
//
// The upsell redirects here with ?oto=… and no redirect_status, because the
// base payment was confirmed one page earlier. The old version only looked at
// redirect_status, so every buyer who ACCEPTED the upsell was told "We couldn't
// confirm this payment" — on success, with a live subscription and a charged
// card. That reads as a failed payment and earns a refund request for a sale
// that worked.
//
// The rule this page now follows: the base purchase is already complete by the
// time anyone arrives here. Nothing about the upsell — accepted, declined,
// expired, or refused by the bank — may imply the purchase failed.

function otoNote(status: string): { tone: "good" | "info"; text: string } | null {
  switch (status) {
    case "accepted":
      return { tone: "good", text: "Your add-on is active too — it's in your library now." };
    // Declining is a normal choice, not an event worth narrating back at them.
    case "declined":
      return null;
    case "used":
      return {
        tone: "info",
        text: "That add-on was already on your account, so it wasn't added twice.",
      };
    case "expired":
    case "invalid":
      return { tone: "info", text: "The add-on offer had expired, so nothing was added." };
    case "charge_failed":
      return {
        tone: "info",
        text: "The add-on couldn't be charged to your card, so it wasn't added. Your purchase is unaffected.",
      };
    default:
      return null;
  }
}

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_intent?: string; redirect_status?: string; oto?: string }>;
}) {
  const { payment_intent, redirect_status, oto } = await searchParams;

  // Finalize idempotently (the webhook calls finalizeOrder too).
  if (payment_intent && redirect_status === "succeeded") {
    await confirmCheckout(payment_intent);
  }

  // What was actually bought, read back rather than passed through the URL:
  // a value in a query string is a value a buyer can edit, and an edited one
  // would land in Meta as real revenue.
  const receipt =
    payment_intent && redirect_status === "succeeded"
      ? await purchaseForTracking(payment_intent)
      : null;

  // What they bought, for the page itself. Found from the payment intent when
  // there is one and otherwise from the signed-in session — a buyer is signed
  // in the moment payment succeeds, and the upsell sends them here carrying
  // only `?oto=…`. Null falls back to the plain confirmation below, so a
  // summary that cannot be built never costs anyone their receipt.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const summary =
    payment_intent || user
      ? await purchaseSummary({ userId: user?.id ?? null, paymentIntentId: payment_intent ?? null })
      : null;

  // Arriving with an oto result means the purchase already completed on the
  // previous page — the upsell is only ever reached after a successful payment.
  const paid = redirect_status === "succeeded" || Boolean(oto);
  const note = oto ? otoNote(oto) : null;

  // Only a redirect_status that is PRESENT and not "succeeded" is a real
  // payment problem. Absent is not failed.
  const failed = Boolean(redirect_status) && redirect_status !== "succeeded";

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-16 text-center">
      {receipt && (
        <TrackPurchase
          orderId={receipt.orderId}
          valueCents={receipt.valueCents}
          currency={receipt.currency}
          trialCents={receipt.trialCents}
          email={receipt.email}
          adsLabel={googleAdsPurchaseLabel()}
        />
      )}
      {paid && summary ? (
        <div className="w-full text-left">
          <PurchaseReceipt summary={summary} />
          {note && (
            <p
              className={`mx-auto mb-10 max-w-xl rounded-xl border px-4 py-3 text-sm ${
                note.tone === "good"
                  ? "border-navy/30 bg-navy/5 text-navy"
                  : "border-border bg-surface-2 text-muted"
              }`}
            >
              {note.text}
            </p>
          )}
        </div>
      ) : paid ? (
        <>
          <h1 className="text-3xl">You&rsquo;re in.</h1>
          <p className="text-muted">
            Payment received. Your purchase is in your library, ready whenever you are.
          </p>
          {note && (
            <p
              className={`rounded-xl border px-4 py-3 text-sm ${
                note.tone === "good"
                  ? "border-navy/30 bg-navy/5 text-navy"
                  : "border-border bg-surface-2 text-muted"
              }`}
            >
              {note.text}
            </p>
          )}
          <Link
            href="/library"
            className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Go to your library
          </Link>
        </>
      ) : failed ? (
        <>
          <h1 className="text-3xl">Still processing</h1>
          <p className="text-muted">
            Payment status: {redirect_status}. If you were charged, your library will update
            shortly.
          </p>
          <Link href="/library" className="text-sm text-primary hover:underline">
            Check your library
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-3xl">Nothing to confirm here</h1>
          <p className="text-muted">
            This page shows the result of a purchase. If you have just bought something, it is in
            your library.
          </p>
          <Link href="/library" className="text-sm text-primary hover:underline">
            Go to your library
          </Link>
        </>
      )}
    </div>
  );
}

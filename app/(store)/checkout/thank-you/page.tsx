import Link from "next/link";
import { confirmCheckout } from "@/app/(store)/checkout/actions";

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_intent?: string; redirect_status?: string }>;
}) {
  const { payment_intent, redirect_status } = await searchParams;

  // Finalize idempotently (the webhook will also call finalizeOrder).
  if (payment_intent && redirect_status === "succeeded") {
    await confirmCheckout(payment_intent);
  }

  const ok = redirect_status === "succeeded";

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-16 text-center">
      {ok ? (
        <>
          <span className="kicker text-primary">Order complete</span>
          <h1 className="text-3xl">You&rsquo;re in.</h1>
          <p className="text-muted">
            Payment received. Your purchase is in your library, ready whenever you are.
          </p>
          <Link
            href="/library"
            className="rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Go to your library
          </Link>
        </>
      ) : (
        <>
          <span className="kicker text-muted">Payment</span>
          <h1 className="text-3xl">Still processing</h1>
          <p className="text-muted">
            {redirect_status
              ? `Payment status: ${redirect_status}. If you were charged, your library will update shortly.`
              : "We couldn't confirm this payment. Please check your library or try again."}
          </p>
          <Link href="/" className="text-sm text-primary hover:underline">
            Back to the store
          </Link>
        </>
      )}
    </div>
  );
}

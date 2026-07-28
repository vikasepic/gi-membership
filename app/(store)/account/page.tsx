import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout, openBillingPortal } from "./actions";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-5 py-10">
        <h1 className="text-2xl">Your account</h1>
        <p className="text-muted">Log in to reach your library and purchases.</p>
        <Link href="/login"
          className="w-fit rounded-full bg-primary px-6 py-3 font-medium text-primary-fg transition-colors hover:bg-primary-hover">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 py-10">
      <h1 className="text-2xl">Your account</h1>
      <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-5">
        <span className="kicker text-muted">Signed in as</span>
        <span>{user.email}</span>
      </div>
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <span className="kicker text-muted">Billing</span>
        <p className="text-sm text-muted">
          Update your card, change or cancel a subscription, and download invoices.
          Handled securely by Stripe.
        </p>
        <form action={openBillingPortal}>
          <button className="w-fit rounded-full border border-border px-5 py-2.5 text-sm hover:border-primary">
            Manage billing &rarr;
          </button>
        </form>
      </section>

      <div className="flex items-center justify-between">
        <Link href="/library" className="text-primary hover:underline">Go to your library</Link>
        <form action={logout}>
          <button type="submit" className="text-sm text-muted hover:text-primary">Log out</button>
        </form>
      </div>
    </div>
  );
}

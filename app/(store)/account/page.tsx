import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout, openBillingPortal } from "./actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { purchaseDocsForUser, subscriptionInvoicesForUser } from "@/lib/receipts";
import { money } from "@/lib/money";
import { NOINDEX } from "@/lib/seo";

export const metadata = NOINDEX;

const when = (iso: string | number) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    typeof iso === "number" ? new Date(iso * 1000) : new Date(iso),
  );

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const { billing } = await searchParams;
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

  const [purchases, invoices] = await Promise.all([
    purchaseDocsForUser(user.id),
    subscriptionInvoicesForUser(user.id),
  ]);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-10">
      <h1 className="text-2xl">Your account</h1>
      <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-5">
        <span className="kicker text-muted">Signed in as</span>
        <span>{user.email}</span>
      </div>
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <span className="kicker text-muted">Appearance</span>
        <ThemeToggle />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <span className="kicker text-muted">Billing</span>
        {billing === "none" ? (
          <p className="text-sm text-muted">
            Nothing to manage yet — billing appears here after your first purchase.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">
              Update your card, change or cancel a subscription, and download invoices.
              Handled securely by Stripe.
            </p>
            <form action={openBillingPortal}>
              <button className="w-fit rounded-full border border-border px-5 py-2.5 text-sm hover:border-primary">
                Manage billing &rarr;
              </button>
            </form>
          </>
        )}
      </section>

      {/* Purchases, each with whatever document Stripe actually issued for it.
          A one-off payment gets a hosted receipt; only subscriptions produce a
          real invoice, so the two are labelled differently rather than both
          called "invoice" and one of them quietly not being one. */}
      {purchases.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
          <span className="kicker text-muted">Your purchases</span>
          <ul className="flex flex-col divide-y divide-border">
            {purchases.map((p) => (
              <li key={p.orderId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{p.description}</span>
                  <span className="text-xs text-muted">
                    {when(p.createdAt)} · {money(p.totalCents, p.currency)}
                    {p.status === "refunded" && " · refunded"}
                  </span>
                </div>
                {p.documentUrl ? (
                  <a
                    href={p.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-sm text-primary hover:underline"
                  >
                    Receipt &rarr;
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-muted">No receipt</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {invoices.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
          <span className="kicker text-muted">Subscription invoices</span>
          <ul className="flex flex-col divide-y divide-border">
            {invoices.map((inv) => (
              <li key={inv.number} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{inv.number}</span>
                  <span className="text-xs text-muted">
                    {when(inv.createdAt)} · {money(inv.totalCents, inv.currency)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  {inv.pdfUrl && (
                    <a href={inv.pdfUrl} className="text-sm text-primary hover:underline">
                      PDF &darr;
                    </a>
                  )}
                  {inv.hostedUrl && (
                    <a
                      href={inv.hostedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted hover:text-fg"
                    >
                      View
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center justify-between">
        <Link href="/library" className="text-primary hover:underline">Go to your library</Link>
        <form action={logout}>
          <button type="submit" className="text-sm text-muted hover:text-primary">Log out</button>
        </form>
      </div>
    </div>
  );
}

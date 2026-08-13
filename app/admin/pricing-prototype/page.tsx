import Link from "next/link";
import { requireAdmin } from "@/lib/admin-guard";
import { PricingPrototype } from "@/components/admin/pricing-prototype";
import { NOINDEX } from "@/lib/seo";

/**
 * Pricing variations, before there is a database behind them.
 *
 * Not linked from the admin navigation, on purpose: this is a design to argue
 * with, not a screen anybody should find by accident. It reads nothing and
 * writes nothing — there is no `offer_prices` table yet, and the point of
 * building this first is that disagreeing with a prototype is cheap and
 * disagreeing with a migration is not.
 *
 * Inline rather than in an iframe, unlike the OTO preview: two of the three
 * panels ARE admin screens, so the admin's own width is the honest one to see
 * them at. The third is the real checkout component at the two widths the
 * checkout actually gives it.
 *
 * Delete this route when the last slice lands.
 */
export const metadata = NOINDEX;

export default async function PricingPrototypePage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link href="/admin" className="kicker text-muted hover:text-fg">
          &larr; Admin
        </Link>
        <h1 className="text-xl">Pricing variations</h1>
        <span className="text-sm text-muted">a prototype — nothing here saves</span>
      </div>

      <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
        Today one offer holds one price, so selling the same thing monthly and
        yearly means building two whole offers and pairing them with a
        &ldquo;Second price&rdquo; dropdown — and two is the most anything can
        ever show. This is what it looks like when the prices live inside the
        offer instead. Type into it: the three panels are wired together, so
        what you tick in the middle is what the checkout draws at the bottom.
      </p>

      <PricingPrototype />
    </div>
  );
}
